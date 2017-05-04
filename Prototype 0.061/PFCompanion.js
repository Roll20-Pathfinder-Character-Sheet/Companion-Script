/*
-----------------------------------------------------------------------------------------------------------------------------------------
Very early draft of the companion script. Proposed handling of token action creation. Token action creation can be chat command triggered,
or done automatically on character creation (and eventually is_npc attribute change). To see auto creation in action, uncomment line 58
Current Command syntax:
!pfc --TAS,ignore=menu-type-to-ignore menu-type-to-ignore ...,limit=only-make-this-menu only-make-this-menu ...|characterid/foldername|characterid/foldername|...
or, if a token(s) representing a character is/are selected:
!pfc --TAS,ignore=menu-type-to-ignore menu-type-to-ignore ...,limit=only-make-this-menu only-make-this-menu ...

Valid arguments for use with ignore/limit are any string contained in the ability call for that menu. As an example, Roll-for-initiative
could be included/ignored by using "Roll","Roll-for","initiative", or "Roll-for-initiative". The exception here is the combat-skills menu,
which requires "combat" or "combat_skills". Arguments should be separated by a space:

!pfc --TAS,ignore=combat|npcs

will create all token actions except for the combat skills menu for all characters in the "npcs" folder.
-----------------------------------------------------------------------------------------------------------------------------------------
Pathfinder Companion Script
-Planned Features-
*StatBlock Import Parser
    Parse for handling by compendium drag-drop handler
*Temp HP/regular HP handling
    Temp HP comes off first
    Healing only heals regular HP
*On the fly Whisper adjustment
*Resource Tracking
    Ammo - Currently attacks simply have a numerical ammo attribute not linked to the inventory
    Spells
        Prepared Casters: Specific spells are prepared X number of times. The preparation count for each specific spell needs to be adjusted when it is cast
        Spont Casters: Can cast a spell of each spell level X number of times per day, need to track spell level slots
    Special abilities (aka Stunning Strike) - Each one has a number of uses per day
    Point pools - Unsure of how to handle these
*Buff/Condition Activation


-Possible Features-
*Database modules
*/

var PFCompanion = PFCompanion || (function() {
    'use strict';

    var version = 'Prototype 0.061',
        sheetVersion = 1.5,
        lastUpdate = 1493915733,
        schemaVersion = 0.061,

    ch = function (c) {
        var entities = {
            '<' : 'lt',
            '>' : 'gt',
            "'" : '#39',
    		'@' : '#64',
			'{' : '#123',
			'|' : '#124',
			'}' : '#125',
			'[' : '#91',
			']' : '#93',
			'"' : 'quot',
			'-' : 'mdash',
			' ' : 'nbsp'
		};

		if(_.has(entities,c) ){
			return ('&'+entities[c]+';');
		}
		return '';
	},
	
	esRE = function (s) {
        var escapeForRegexp = /(\\|\/|\[|\]|\(|\)|\{|\}|\?|\+|\*|\||\.|\^|\$)/g;
        return s.replace(escapeForRegexp,"\\$1");
    },

    HE = (function(){
        var entities={
            //' ' : '&'+'nbsp'+';',
            '&' : '&'+'amp'+';',
            '<' : '&'+'lt'+';',
            '>' : '&'+'gt'+';',
            "'" : '&'+'#39'+';',
            '@' : '&'+'#64'+';',
            '{' : '&'+'#123'+';',
            '|' : '&'+'#124'+';',
            '}' : '&'+'#125'+';',
            ',' : '&'+'#44'+';',
            '[' : '&'+'#91'+';',
            ']' : '&'+'#93'+';',
            '"' : '&'+'quot'+';',
            ':' : '&'+'#58'+';',
            //'-' : '&'+'mdash'+';'
        },
        re=new RegExp('('+_.map(_.keys(entities),esRE).join('|')+')','g');
        return function(s){
            return s.replace(re, function(c){ return entities[c] || c; });
        };
    }()),
    
    checkInstall = function() {
        //state.PFCompanion.TAS = 'auto';
        //state.PFCompanion.ResourceTrack = true;
        log('-=> Pathfinder Companion v'+version+' || Compatible with Sheet Version '+sheetVersion+' <=-  ['+(new Date(lastUpdate*1000))+']');
        if( ! _.has(state,'PFCompanion') || state.PFCompanion.version !== schemaVersion) {
            log('  > Updating Schema to v'+schemaVersion+' <');
            state.PFCompanion = state.PFCompanion || {};
            state.PFCompanion.version = schemaVersion;
		};
		if(state.PFCompanion.TAS === 'auto' || state.PFCompanion.ResourceTrack){
		    initialize();
		}else{
		    log('  > Pathfinder Companion: No Initialization Options Enabled <');
		}
		generateHelp();
	},
	
    generateHelp = function(){
        var notes,gmnotes,
            helpCharacter = state.PFCompanion.helpLink ? getObj('handout',state.PFCompanion.helpLink) : undefined;
        if(!helpCharacter){
            helpCharacter = createObj('handout',{name:'Pathfinder Companion',archived:true,inplayerjournals:'all'});
            state.PFCompanion.helpLink = helpCharacter.id;
        }
        
        notes = '<h2>Pathfinder Companion v'+version+'</h2>'
            +'<p>'
            +'Current macro setup and command syntax:'
            +'</p>'
            +'<h4>Macro Setup</h4>'
            +'<ul>'
            +'<li><b>Weapons:</b> Weapons can be setup to track ammo usage (according to # of attacks used, including usage of manyshot), other item usage, spell usage, ability usage, and custom attribute usage.'
                +'<ul>'
                +'<li><b>Ammo Tracking:</b> Setting the ammo field of a weapon to anything besides 1 tells the script that that weapon uses ammo. The script will'
                +'generate the following field in the macro text of the weapon: <b>||ammo=?{Name of Ammunition Item}||</b>. After the first time you answer this query, it will be replaced with your response.'
                +'You can also manually put a different query in here to be prompted for what ammunition to use with each attack routine.</li>'
                +'<li><b>Spell or Ability Tracking:</b> If a weapon is linked to a spell or ability (that has uses), an additional roll template field will be added to the macro that will display a button to output'
                +'the spell card as well as buttons to increment, decrement, or custom adjust the number of spells used.</li>'
                +'</ul>'
            +'</li>'
            +'<li><b>Spells:</b> A field similar to that for weapons linked to a spell will be added to all spells.'
            +'</li>'
            +'<li><b>Abilities:</b> A field similar to that for weapons linked to an ability will be added to all abilities that have uses.'
            +'</li>'
            +'<li><b>custom attribute:</b> Entering <b>%%What you named the custom attribute%%</b> into the description field (notes field for weapons) will cause the script to '
                +'put a field similar to the spell or ability to allow you to adjust the quantity of it. This will only be created for those custom attributes '
                +'that have a current/max comparison. This can also be used to add fields for spells,abilities, or items without having to directly edit the macro text.'
            +'</li>'
            +'</ul>'
            +'<h4>Command syntax</h4>'
            +'<ul>'
            +'<li><b>Item tracking:</b> !pfc --resource,item=Item Name,current=max OR +/-X OR X,max=+/-X OR X|characterid|characterid|...</li>'
            +'<li><b>Ability tracking:</b> !pfc --resource,ability=Ability Name,current=max OR +/-X OR X|characterid|characterid|...</li>'
            +'<li><b>Spell tracking:</b> !pfc --resource,spell=Spell Name,current=max OR +/-X OR X|characterid|characterid|...</li>'
            +'<li><b>Custom Attribute tracking:</b> !pfc --resource,note=Custom Attribute Name,current=max OR +/-X OR X|characterid|characterid|...</li>'
            +'</ul>';
            
        helpCharacter.set('notes',notes);
    },
    
    initialize = async function(){
        var characters;
            
        characters=findObjs({type:'character'});
        //populate macro text with appropriate ammo, ability, and spell handling syntax
        for(var i = 0;i<characters.length;i++){
            await initializeCharacter(characters[i]);
            log('  > Pathfinder Companion: '+characters[i].get('name')+' initialized <')
        }
        log('  > Pathfinder Companion: Initialization Completed <');
    },
    
    initializeCharacter = function(c){
        var attributes = findObjs({type:'attribute',characterid:c.id}),
            rollIds,rowID;
            
        return new Promise((resolve,reject)=>{
            _.defer((a,chr)=>{
                if(state.PFCompanion.TAS === 'auto'){
                    tokenActionMaker(chr);
                }
                if(state.PFCompanion.ResourceTrack){
                    rollIds = _.filter(attributes,(a)=>{
                        return a.get('name').indexOf('repeating_')===0 && a.get('name').match(/(?:_([^_]+)_name)/);
                    });
                    _.each(rollIds,(r)=>{
                        rowID = r.get('name').match(/(?:_(-[^_]+)_name)/);
                        rowID = rowID ? rowID[1] : undefined;
                        rowID ? initializeRepeatingResourceTracking(rowID,attributes) : undefined;
                    });
                }
                resolve('initialized');
            },attributes,c);
        });
    },
    
    //                                          string   [Roll20attr]
    initializeRepeatingResourceTracking = function(r,attributes){
        if(!r || !attributes){
            return;
        }
        var macroTextName,macroTextObject,sectionType,
            isNPC = getAttrByName(attributes[0].get('characterid'),'is_npc')==='0' ? false : true,
            handleSection = {
                'weapon':(c,o,a,n,row)=>initializeWeapon(c,o,a,n,row),
                'spells':(c,o,a,n,row)=>initializeSpell(c,o,a,n,row),
                'item':(c,o,a,n,row)=>initializeItem(c,o,a,n,row),
                'ability':(c,o,a,n,row)=>initializeAbility(c,o,a,n,row),
                'none':(c,o,a,n,row)=>undefined
            },
            itemText = '&{template:pf_block} @{toggle_accessible_flag} @{toggle_rounded_flag} {{color=@{rolltemplate_color}}} {{header_image=@{header_image-pf_block-item}}} {{character_name=@{character_name}}} {{character_id=@{character_id}}} {{subtitle}} {{name=@{name}}} {{hasuses=@{has_uses}}} {{qty=@{qty}}} {{qty_max=@{qty_max}}} {{shortdesc=@{short-description}}} {{description=@{description}}}',
            abilityText = '&{template:pf_ability} @{toggle_accessible_flag} @{toggle_rounded_flag} {{color=@{rolltemplate_color}}} {{header_image=@{header_image-pf_ability}}} {{character_name=@{character_name}}} {{character_id=@{character_id}}} {{subtitle=^{@{rule_category}}}} {{name=@{name}}} {{rule_category=@{rule_category}}} {{source=@{class-name}}} {{is_sp=@{is_sp}}} {{hasspellrange=@{range_pick}}} {{spell_range=^{@{range_pick}}}} {{casterlevel=[[@{casterlevel}]]}} {{spell_level=[[@{spell_level}]]}} {{hasposrange=@{hasposrange}}} {{custrange=@{range}}} {{range=[[@{range_numeric}]]}} {{save=@{save}}} {{savedc=[[@{savedc}]]}} {{hassr=@{abil-sr}}} {{sr=^{@{abil-sr}}}} {{hasfrequency=@{hasfrequency}}} {{frequency=^{@{frequency}}}} {{next_cast=@{rounds_between}}} {{hasuses=@{hasuses}}} {{uses=@{used}}} {{uses_max=@{used|max}}} {{cust_category=@{cust-category}}} {{concentration=[[@{Concentration-mod}]]}} {{damage=@{damage-macro-text}}} {{damagetype=@{damage-type}}} {{hasattack=@{hasattack}}} {{attacktype=^{@{abil-attacktypestr}}}} {{targetarea=@{targets}}} {{duration=@{duration}}} {{shortdesc=@{short-description}}} {{description=@{description}}} {{deafened_note=@{SpellFailureNote}}}',
            spellText = '&{template:pf_spell} @{toggle_spell_accessible} @{toggle_rounded_flag} {{color=@{rolltemplate_color}}} {{header_image=@{header_image-pf_spell}}} {{name=@{name}}} {{character_name=@{character_name}}} {{character_id=@{character_id}}} {{subtitle}} {{deafened_note=@{SpellFailureNote}}} @{spell_options} ',
            weaponText = '&{template:pf_attack} @{toggle_attack_accessible} @{toggle_rounded_flag} {{color=@{rolltemplate_color}}} {{character_name=@{character_name}}} {{character_id=@{character_id}}} {{subtitle}} {{name=@{name}}} {{attack=[[ 1d20cs>[[ @{crit-target} ]] + @{attack_macro} ]]}} {{damage=[[@{damage-dice-num}d@{damage-die} + @{damage_macro}]]}} {{crit_confirm=[[ 1d20 + @{attack_macro} + [[ @{crit_conf_mod} ]] ]]}} {{crit_damage=[[ [[ @{damage-dice-num} * (@{crit-multiplier} - 1) ]]d@{damage-die} + ((@{damage_macro}) * [[ @{crit-multiplier} - 1 ]]) ]]}} {{type=@{type}}} {{weapon_notes=@{notes}}} @{iterative_attacks} @{macro_options} {{vs=@{vs}}} {{vs@{vs}=@{vs}}} {{precision_dmg1=@{precision_dmg_macro}}} {{precision_dmg1_type=@{precision_dmg_type}}} {{precision_dmg2=@{global_precision_dmg_macro}}} {{precision_dmg2_type=@{global_precision_dmg_type}}} {{critical_dmg1=@{critical_dmg_macro}}} {{critical_dmg1_type=@{critical_dmg_type}}} {{critical_dmg2=@{global_critical_dmg_macro}}} {{critical_dmg2_type=@{global_critical_dmg_type}}} {{attack1name=@{iterative_attack1_name}}}';
            
        macroTextName = _.find(attributes,(a)=>{
            return a.get('name').match(/repeating_.+_-[^_]+_name$/) && a.get('name').toLowerCase().match(r.toLowerCase());
        });
        macroTextName = macroTextName ? macroTextName.get('name').replace('name',((isNPC && macroTextName.get('name').indexOf('item')===-1) ? (macroTextName.get('name').indexOf('spells')===-1 ? 'NPC-macro-text' : 'npc-macro-text') : 'macro-text')) : undefined;
        
        if(!macroTextName){
            return;
        }
        sectionType = macroTextName.match(/(?:repeating_([^_]+)_)/) ? macroTextName.match(/(?:repeating_([^_]+)_)/)[1] : undefined;
        macroTextObject = macroTextName ? _.find(attributes,(a)=>{return a.get('name').toLowerCase()===macroTextName.toLowerCase()}) : undefined;
        macroTextObject = macroTextObject ? macroTextObject : createObj('attribute',{
            characterid:attributes[0].get('characterid'),
            name:macroTextName,
            current:(isNPC ? '@{NPC-whisper} ' : '@{PC-whisper} ')+(macroTextName.indexOf('repeating_weapon_')===0 ? weaponText : (macroTextName.indexOf('repeating_spell')===0 ? spellText : (macroTextName.indexOf('repeating_ability')===0 ? abilityText : (macroTextName.indexOf('repeating_item')===0 ? itemText : ''))))
        });
        if(sectionType!=='weapon' && sectionType!=='spells' & sectionType!=='item' & sectionType!=='ability'){
            sectionType = 'none';
        }
        macroTextObject ? handleSection[(sectionType || 'none')](getObj('character',macroTextObject.get('characterid')),macroTextObject,attributes,isNPC,r) : undefined;
    },
    
    initializeWeapon = function(character,macroTextObject,attributes,isNPC,rowID){
        var rollTemplate,
            spellClass,spontaneous,sourceSpellName,duplicateSpell,spellButtonField,
            mainAmmo,offAmmo,
            sourceSpell = getAttrByName(character.id,macroTextObject.get('name').replace((isNPC ? 'NPC-macro-text' : 'macro-text'),'source-spell')),
            abilityButtonField,duplicateAbility,abilityName,abilityFrequency,abilityUses,
            sourceAbility = _.find(attributes,(a)=>{return a.get('name')===macroTextObject.get('name').replace(isNPC ? 'NPC-macro-text' : 'macro-text','source-ability')}),
            usesAmmo = getAttrByName(character.id,macroTextObject.get('name').replace(isNPC ? 'NPC-macro-text' : 'macro-text','ammo'))==='0' ? false : true,
            macroText = macroTextObject.get('current'),
            mainhand = _.find(attributes,(a)=>{return a.get('name')===macroTextObject.get('name').replace(isNPC ? 'NPC-macro-text' : 'macro-text','source-main')}),
            offhand = _.find(attributes,(a)=>{return a.get('name')===macroTextObject.get('name').replace(isNPC ? 'NPC-macro-text' : 'macro-text','source-off')}),
            toAdd = '';
            
        sourceSpellName = sourceSpell ? _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_spells_'+sourceSpell.toLowerCase()+'_name'}) : undefined;
        if(sourceSpellName){
            spellClass = parseInt(getAttrByName(character.id,'repeating_spells_'+sourceSpell+'_spellclass_number'));
            spontaneous = spellClass>-1 ? (getAttrByName(character.id,'spellclass-'+spellClass+'-casting_type')==='1' ? true : false) : undefined;
            spellButtonField = spontaneous!==undefined ? ('{{['+sourceSpellName.get('current')+' Spell Card](~'+character.get('name')+'|'+sourceSpellName.get('name').replace('_name',(isNPC ? '_npc-roll' : '_roll'))+')=[**-**](!pfc --resource,spell='+sourceSpellName.get('current')+',current=-1|'+character.id+')[**+**](!pfc --resource,spell='+sourceSpellName.get('current')+',current=+1|'+character.id+')[**?**](!pfc --resource,spell='+sourceSpellName.get('current')+',current=?'+HE('{')+'Spell Adjustment}|'+character.id+')}}') : '';
            duplicateSpell = macroText.match(/{{\[[^\]]+ Spell Card\]\(~[^\)]+\)=\[\*\*-\*\*\]\([^\)]+\)\[\*\*\+\*\*\]\([^\)]+\)\[\*\*\?\*\*\]\([^\)]+\)}}/g);
            duplicateSpell = duplicateSpell ? _.reject(duplicateSpell,(d)=>{return (d.indexOf(sourceSpellName.get('current'))>-1  && d.match(/\[\*\*\+\*\*\]/) && d.match(/\[\*\*-\*\*\]/) && d.match(/\[\*\*\?\*\*\]/))}) : undefined;
        }
        sourceAbility = sourceAbility ? sourceAbility.get('current'):undefined;
        abilityName = sourceAbility ? _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_ability_'+sourceAbility.toLowerCase()+'_name'}) : undefined;
        if(abilityName){
            abilityUses = _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_ability_'+sourceAbility.toLowerCase()+'_hasuses'});
            abilityUses = abilityUses ? (abilityUses.get('current')==='1' ? true : false) : false;
            if(abilityUses){
                abilityButtonField = '{{['+abilityName.get('current')+' Description](~'+character.get('name')+'|'+abilityName.get('name').replace('_name',(isNPC ? '_npc-roll' : '_roll'))+')=[**-**](!pfc --resource,ability='+abilityName.get('current')+',current=-1|'+character.id+')[**+**](!pfc --resource,ability='+abilityName.get('current')+',current=+1|'+character.id+')[**?**](!pfc --resource,ability='+abilityName.get('current')+',current=?'+HE('{')+'Ability Adjustment}|'+character.id+')}}'
                duplicateAbility = macroText.match(/{{\[[^\]]+ Description\]\(~[^\)]+\)=\[\*\*-\*\*\]\([^\)]+\)\[\*\*\+\*\*\]\([^\)]+\)\[\*\*\?\*\*\]\([^\)]+\)}}/g);
                duplicateAbility = duplicateAbility ? _.reject(duplicateAbility,(d)=>{return (d.indexOf('ability='+abilityName.get('current'))>-1  && d.match(/\[\*\*\+\*\*\]/) && d.match(/\[\*\*-\*\*\]/) && d.match(/\[\*\*\?\*\*\]/))}) : undefined;
            }
        }
        mainhand = mainhand ? mainhand.get('current') : undefined;
        offhand = offhand ? offhand.get('current') : undefined;
        mainAmmo = mainhand ? _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_weapon_'+mainhand+'_ammo'}) : undefined;
        offAmmo = offhand ? _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_weapon_'+offhand+'_ammo'}) : undefined;
        mainAmmo = mainAmmo ? (mainAmmo.get('current')!=='0' ? true : false) : undefined;
        offAmmo = offAmmo ? (offAmmo.get('current')!=='0' ? true : false) : undefined;
        rollTemplate = macroText.match(/(?:&{template:(.*)})/) ? macroText.match(/(?:&{template:([^}]+)})/)[1] : undefined;
        toAdd += rollTemplate ? ((!macroText.match(/\|\|rowid=.+\|\|/) ? '||rowid='+rowID+'||' : '')
                +((macroText.indexOf(spellButtonField)===-1 && spellButtonField && spontaneous!==undefined) ? spellButtonField : '')
                +((macroText.indexOf(abilityButtonField)===-1 && abilityButtonField) ? abilityButtonField : '')
                +((!macroText.match(/\|\|item=.+\|\||\|\|mainitem=.+\|\||\|\|offitem=.+\|\|/) && usesAmmo) ? ((mainAmmo || offAmmo) ? ((mainAmmo ? '||mainitem=?{Mainhand Ammunition}||' : '')+(offAmmo ? '||offitem=?{Offhand Ammunition}||' : '')) : '||item=?{Name of Ammunition Item}||') : '')) : '';
        duplicateSpell ? _.each(duplicateSpell,(d)=>{macroText = macroText.replace(d,'')}) : undefined;
        duplicateAbility ? _.each(duplicateAbility,(d)=>{macroText = macroText.replace(d,'')}) : undefined;
        macroText = toAdd.length>0 ? macroText.replace('&{template:'+rollTemplate+'} ','&{template:'+rollTemplate+'} '+toAdd+' ') : macroText;
        toAdd.length>0 ? macroTextObject.set('current',macroText) : undefined;
    },
    
    initializeSpell = function(character,macroTextObject,attributes,isNPC,rowID){
        var rollTemplate,spontaneous,duplicateSpell,toAdd,itemQuery,spellButtonField,
            itemButtonField = '',
            macroText = macroTextObject.get('current'),
            spellClass = parseInt(getAttrByName(character.id,'repeating_spells_'+rowID+'_spellclass_number')),
            spellName = _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_spells_'+rowID.toLowerCase()+'_name'});
            
        if(!spellName){
            return;
        }
        
        spontaneous = spellClass>-1 ? (getAttrByName(character.id,'spellclass-'+spellClass+'-casting_type')==='1' ? true : false) : undefined;
        if(spontaneous===undefined || !spellName){
            return;
        }
        spellButtonField = spontaneous!==undefined ? ('{{Spell Tracking=[**-**](!pfc --resource,spell='+spellName.get('current')+',current=-1|'+character.id+')[**+**](!pfc --resource,spell='+spellName.get('current')+',current=+1|'+character.id+')[**?**](!pfc --resource,spell='+spellName.get('current')+',current=?'+HE('{')+'Spellcasting Adjustment}|'+character.id+')}}') : '';
        duplicateSpell = macroText.match(/{{Spell Tracking=\[\*\*-\*\*\]\([^\)]+\)\[\*\*\+\*\*\]\([^\)]+\)\[\*\*\?\*\*\]\([^\)]+\)}}/g);
        duplicateSpell = duplicateSpell ? _.reject(duplicateSpell,(d)=>{return (d.indexOf(spellName.get('current'))>-1  && d.match(/\[\*\*\+\*\*\]/) && d.match(/\[\*\*-\*\*\]/) && d.match(/\[\*\*\?\*\*\]/))}) : undefined;
        rollTemplate = macroText.match(/(?:&{template:(.*)})/) ? macroText.match(/(?:&{template:([^}]+)})/)[1] : undefined;
        toAdd = (macroText.indexOf(spellButtonField)===-1 && spellButtonField.length>0 && spontaneous!==undefined) ? spellButtonField : '';
        duplicateSpell ? _.each(duplicateSpell,(d)=>{macroText = macroText.replace(d,'')}) : undefined;
        toAdd ? macroTextObject.set('current',macroText.replace('&{template:'+rollTemplate+'} ','&{template:'+rollTemplate+'} '+toAdd+' ')) : undefined;
    },
    
    initializeAbility = function(character,macroTextObject,attributes,isNPC,rowID){
        var rollTemplate,duplicate,abilityButtonField,duplicate,hasUses,
            macroText = macroTextObject.get('current'),
            toAdd = '',
            abilityName = _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_ability_'+rowID.toLowerCase()+'_name'});
            
        if(!abilityName){
            return;
        }
        
        hasUses = getAttrByName(character.id,'repeating_ability_'+rowID+'_hasuses') === '1' ? true : false;
        
        duplicate = macroText.match(/{{Ability Tracking=\[\*\*-\*\*\]\([^\)]+\)\[\*\*\+\*\*\]\([^\)]+\)\[\*\*\?\*\*\]\([^\)]+\)}}/g);
        if(rowID.toLowerCase()==='-kiuymyoqvgo04whxjou'){
            log(hasUses);
            log(duplicate);
        }
        _.each(duplicate,(d)=>{
            if(rowID.toLowerCase()==='-kiuymyoqvgo04whxjou'){
                log(d);
            }
            macroText = (!d.match('='+abilityName.get('current')+',') || !hasUses) ? macroText.replace(d+' ','') : macroText;
        });
        abilityButtonField = '{{Ability Tracking=[**-**](!pfc --resource,ability='+abilityName.get('current')+',current=-1|'+character.id+')[**+**](!pfc --resource,ability='+abilityName.get('current')+',current=+1|'+character.id+')[**?**](!pfc --resource,ability='+abilityName.get('current')+',current=?'+HE('{')+'Ability Adjustment}|'+character.id+')}}';
        toAdd = (!macroText.match(/{{Ability Tracking=.*}}/) && abilityButtonField && hasUses) ? abilityButtonField : '';
        rollTemplate = macroText.match(/(?:&{template:(.*)})/) ? macroText.match(/(?:&{template:([^}]+)})/)[1] : undefined;
        macroText = toAdd!=='' ? macroText.replace('&{template:'+rollTemplate+'} ','&{template:'+rollTemplate+'} '+toAdd+' ') : macroText;
        macroText!=='' ? macroTextObject.set('current',macroText) : undefined;
    },
    
    initializeItem = function(character,macroTextObject,attributes,isNPC,rowID){
        var rollTemplate,duplicate,itemButtonField,
            macroText = macroTextObject.get('current'),
            toAdd = '',
            itemName = _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_item_'+rowID.toLowerCase()+'_name'});
        if(!itemName){
            return;
        }
        duplicate = macroText.match(/{{Inventory Tracking=\[\*\*-\*\*\]\([^\)]+\)\[\*\*\+\*\*\]\([^\)]+\)\[\*\*\?\*\*\]\([^\)]+\)}}/g);
        duplicate = duplicate ? _.reject(duplicate,(d)=>{return d.indexOf(itemName.get('current'))>-1}) : undefined;
        duplicate ? _.each(duplicate,(d)=>{macroText = macroText.replace(d,'')}) : undefined;
        itemButtonField = '{{Inventory Tracking=[**-**](!pfc --resource,item='+itemName.get('current')+',current=-1|'+character.id+')[**+**](!pfc --resource,item='+itemName.get('current')+',current=+1|'+character.id+')[**?**](!pfc --resource,item='+itemName.get('current')+',current=?'+HE('{')+itemName.get('current')+' Adjustment}|'+character.id+')}}';
        rollTemplate = macroText.match(/(?:&{template:(.*)})/) ? macroText.match(/(?:&{template:([^}]+)})/)[1] : undefined;
        toAdd = (!macroText.match(/{{Inventory Tracking=.*}}/) && itemButtonField) ? itemButtonField : '';
        toAdd ? macroTextObject.set('current',macroText.replace('&{template:'+rollTemplate+'} ','&{template:'+rollTemplate+'} '+toAdd+' ')) : undefined;
    },
    
    checkForCustomTracking = function(description){
        var rowID = extractRowID(description.get('name')),
            attributes = findObjs({type:'attribute',characterid:description.get('characterid')}),
            sectionType = description.get('name').match(/weapon|spells|item|ability/) ? description.get('name').match(/weapon|spells|item|ability/)[0] : undefined,
            isNPC = getAttrByName(description.get('characterid'),'is_npc')==='0' ? false: true,
            customTrack = description.get('current').match(/\s*%%.+%%\s*/),
            customTrackCommand = {
                'weapon':undefined,
                'item':'item',
                'spells':'spell',
                'ability':'ability',
                'custom':'note'
            },
            macroObject,macroText,currentCustomTracking,customTrackType,trackObject,customTrackField,rollTemplate;
            
        if(!customTrack){
            return;
        }
        customTrack = customTrack[0];
        description.set('current',description.get('current').replace(customTrack,' ').trim());
        customTrack = customTrack.replace(/%/g,'').trim();
        trackObject = _.find(attributes,(a)=>{return a.get('current')===customTrack && a.get('name').match(/repeating_.+_-.+_name|custom[ac]\d+-name/)});
        customTrackType = trackObject ? trackObject.get('name').match(/weapon|spells|item|ability|custom/) : undefined;
        macroObject =  _.find(attributes,(a)=>{return a.get('name').toLowerCase()===description.get('name').toLowerCase().replace((sectionType==='weapon' ? 'notes' : 'description'),((isNPC && sectionType!=='ability') ? 'npc-macro-text' : 'macro-text'))});
        macroText = macroObject.get('current');
        rollTemplate = macroText.match(/&{template:[^}]+}/) ? macroText.match(/&{template:[^}]+}/)[0] : undefined;
        currentCustomTracking = macroObject ? macroObject.get('current').match('{{'+customTrack+' Tracking=.*}}') : undefined;
        if(!currentCustomTracking){
            customTrackField = '{{'+customTrack+' Tracking=[**-**](!pfc --resource,'+customTrackCommand[customTrackType]+'='+customTrack+',current=-1|'+description.get('characterid')+')[**+**](!pfc --resource,'+customTrackCommand[customTrackType]+'='+customTrack+',current=+1|'+description.get('characterid')+')[**?**](!pfc --resource,'+customTrackCommand[customTrackType]+'='+customTrack+',current=?'+HE('{')+customTrack+' Adjustment}|'+description.get('characterid')+')}}';
            macroText = rollTemplate ? macroText.replace(rollTemplate,rollTemplate+' '+customTrackField) : macroText;
            macroObject.set('current',macroText);
        }else{
            sendChat('Resource Tracking','/w "'+getObj('character',description.get('characterid')).get('name')+'" There is already resource tracking handling for '+customTrack+' in the macro.');
        }
    },
    
    deleteAmmoTracking = function(r,attributes){
        var macroTextName = _.find(attributes,(a)=>{return a.get('name').indexOf(r+'_name')>0}),
            isNPC = getAttrByName(attributes[0].get('characterid'),'is_npc')==='0' ? false : true,
            macroTextObject,ammoString,macroText;
            
        macroTextName = macroTextName ? macroTextName.get('name').replace('name',(macroTextName.get('name').indexOf('item')=== -1 && isNPC ? 'NPC-macro-text' : 'macro-text')) : undefined;
        macroTextObject = macroTextName ? _.find(attributes,(a)=>{return a.get('name')===macroTextName}) : undefined;
        macroText = macroTextObject ? macroTextObject.get('current') : undefined;
        ammoString = macroText ? macroText.match(/\|\|item=.+?\|\||\|\|mainitem=.+?\|\||\|\|offitem=.+?\|\|/g) : undefined;
        _.each(ammoString,(s)=>{
            macroText = macroText.replace(s,'');
        });
        macroTextObject.set('current',macroText);
        //(macroTextObject && ammoString) ? macroTextObject.set('current',macroTextObject.get('current').replace(ammoString[0],'')) : undefined;
    },
	
	idToDisplayName = function(id){
        var player = getObj('player', id);
        if(player){
            return player.get('displayname');
        }else{
            return 'gm';
        }
    },
	
	//Rest handling
    
    //create token actions for the selected character
    //                          Roll20Char Array        Array
    tokenActionMaker = function(character,toCreate,toIgnore){
        var npc = getAttrByName(character.id,'is_npc'),
            spells = getAttrByName(character.id,'use_spells'),
            abilities = findObjs({type:'ability',characterid:character.id}),
            npcAbilities = ['NPC-ability_checks','NPC-initiative_Roll','NPC-defenses','NPC-attacks','NPC-abilities','NPC-combat_skills','NPC-skills','NPC-items'],
            pcAbilities = ['ability_checks','Roll-for-initiative','defenses','attacks','abilities','combat_skills','skills','items'],
            spell2,spell3;
            
        toCreate = toCreate ? toCreate:state.PFCompanion.toCreate;
        toIgnore = toIgnore ? toIgnore:state.PFCompanion.toIgnore;
        
        if(spells === '1'){
            npcAbilities.push('NPC-spellbook-0');
            pcAbilities.push('spellbook-0');
            spell2 = getAttrByName(character.id,'spellclass-1');
            spell3 = getAttrByName(character.id,'spellclass-2');
            if(spell2 && spell2!=='-1'){
                npcAbilities.push('NPC-spellbook-1');
                pcAbilities.push('spellbook-1');
            }
            if(spell3 && spell3!=='-1'){
                npcAbilities.push('NPC-spellbook-2');
                pcAbilities.push('spellbook-2');
            }
        }
        if(npc==='0'){
            pcAbilities = toCreate ? _.filter(pcAbilities,(a)=>{return _.some(toCreate,(c)=>{return c!=='skills' ? a.indexOf(c)>-1 : (a.indexOf(c)>-1 && a.indexOf('combat')===-1)})}) : pcAbilities;
            pcAbilities = toIgnore ? _.reject(pcAbilities,(a)=>{return _.some(toIgnore,(c)=>{return c!=='skills' ? a.indexOf(c)>-1 : (a.indexOf(c)>-1 && a.indexOf('combat')===-1)})}) : pcAbilities;
            _.each(abilities,(a)=>{
                if(_.some(npcAbilities,(n)=>{return a.get('description')===n})){
                    a.remove();
                }
            });
            _.each(pcAbilities,(a)=>{
                if(!_.some(abilities,(ab)=>{return ab.get('description')===a})){
                    createObj('ability',{
                        _characterid:character.id,
                        name:a.indexOf('spellbook')>-1 ? (getAttrByName(character.id,'spellclass-'+a.replace('spellbook-','')+'-name')+' spellbook') : (a +'_token_action'),
                        action:'%{'+character.get('name')+'|'+a+'}',
                        istokenaction:true,
                        description:a
                    });
                }
            });
        }else {
            npcAbilities = toCreate ? _.filter(npcAbilities,(a)=>{return _.some(toCreate,(c)=>{return c!=='skills' ? a.indexOf(c)>-1 : (a.indexOf(c)>-1 && a.indexOf('combat')===-1)})}) : npcAbilities;
            npcAbilities = toIgnore ? _.reject(npcAbilities,(a)=>{return _.some(toIgnore,(c)=>{return c!=='skills' ? a.indexOf(c)>-1 : (a.indexOf(c)>-1 && a.indexOf('combat')===-1)})}) : npcAbilities;
            _.each(abilities,(a)=>{
                if(_.some(pcAbilities,(n)=>{return a.get('description')===n})){
                    a.remove();
                }
            });
            _.each(npcAbilities,(a)=>{
                if(!_.some(abilities,(ab)=>{return ab.get('description')===a})){
                    createObj('ability',{
                        _characterid:character.id,
                        name:a.indexOf('spellbook')>-1 ? (getAttrByName(character.id,'spellclass-'+a.replace('NPC-spellbook-','')+'-name')+' spellbook') : (a +'_token_action'),
                        action:'%{'+character.get('name')+'|'+a+'}',
                        istokenaction:true,
                        description:a
                    });
                }
            });
        }
    },
    
    //Ammo Handling
    //                  string [Roll20 Attrs] Roll20Char Roll20msg, string
    
    handleAmmoCommand = function(ammo,character,changeCurrent,changeMax){
        var attributes=findObjs({type:'attribute',characterid:character.id}),
            ammoNameAttr,rowID,ammoAttr,insufficient;
            
        ammoNameAttr = _.find(attributes,(a)=>{return a.get('name').match(/repeating_item_[^_]+_name/) && a.get('current')===ammo});
        rowID = ammoNameAttr ? extractRowID(ammoNameAttr.get('name')) : undefined;
        ammoAttr = rowID ? _.find(attributes,(a)=>{return a.get('name')===('repeating_item_'+rowID+'_qty')}) : undefined;
        if(ammoAttr){
            changeMax ? setResource(ammoAttr,true,changeMax) : undefined;
            insufficient = changeCurrent ? setResource(ammoAttr,false,changeCurrent) : 0;
            msgResourceState(character,(getAttrByName(character.id,'is_npc')==='0' ? false : true),rowID,0,((0-insufficient)||0),ammoAttr);
        }
    },
    
    handleSpellCommand = function(spell,character,spellClass,changeCurrent){
        var attributes = findObjs({type:'attribute',characterid:character.id}),
            manualTotal = getAttrByName(character.id,'total_spells_manually')==='0' ? false : true,
            isNPC = getAttrByName(character.id,'is_npc')==='0' ? false : true,
            workerWait,attrToID,spellNameAttr,rowID,spellUsedAttr,insufficient,spontaneous,spellMax,spellLevel,spellMaxValue;
            
        spellNameAttr = _.find(attributes,(a)=>{return a.get('name').match(/repeating_spells_-[^_]+_name/) && a.get('current')===spell});
        rowID = spellNameAttr ? extractRowID(spellNameAttr.get('name')) : undefined;
        if(!rowID){
            return;
        }
        if(spellClass){
            spellClass = _.find(attributes,(a)=>{return a.get('name').match(/spellclass-[012]-name/) && a.get('current')===spellClass});
            spellClass = spellClass ? spellClass.match(/(?:spellclass-([012])-name)/)[1] : undefined;
        }else{
            spellClass = _.find(attributes,(a)=>{return a.get('name')===('repeating_spells_'+rowID+'_spellclass_number')});
            spellClass = spellClass ? spellClass.get('current') : undefined;
        }
        if(!spellClass){
            return;
        }
        spontaneous = getAttrByName(character.id,'spellclass-'+spellClass+'-casting_type')==='1' ? true: false;
        spellLevel = getAttrByName(character.id,'repeating_spells_'+rowID+'_spell_level');
        if(!spellLevel){
            return;
        }
        spellUsedAttr = rowID ? _.find(attributes,(a)=>{return a.get('name').toLowerCase()===('repeating_spells_'+rowID+'_used').toLowerCase()}) : ((parseInt(spell) && spellClass && manualTotal) ? _.find(attributes,(a)=>{return a.get('name')==='spellclass-'+spellClass+'-level-'+spell+'spells-per-day'}) : undefined);
        spellUsedAttr = spellUsedAttr ? spellUsedAttr : createObj('attribute',{characterid:character.id,name:'repeating_spells_'+rowID+'_used'});
        if(spellUsedAttr){
            workerWait = spellUsedAttr.get('current')==='' ? setResource(spellUsedAttr,false,0,true,0) : Promise.resolve(0);
            workerWait.then((w)=>{
                spellMax = _.find(attributes,(a)=>{return a.get('name')===('spellclass-'+spellClass+'-level-'+spellLevel+'-spells-per-day')});
                if(spellMax){
                    spellMax.get('current') === '' ? spellMax.set('current','0') : undefined;
                    attrToID = spellUsedAttr.get('name').match(/(?:(repeating_.+_-[^_]+)_.+)/);
                    attrToID = attrToID ? attrToID[1] : undefined;
                    spellMaxValue = parseInt(spellMax.get('max'))-((spellMax.get('current')!=='' ? parseInt(spellMax.get('current')) : 0)-parseInt(spellUsedAttr.get('current')));
                    insufficient = (changeCurrent && spellUsedAttr && rowID) ? setResource(spellUsedAttr,false,changeCurrent,true,spellMaxValue) : Promise.resolve(0);
                    insufficient.then((i)=>{
                        i = spontaneous ? (i - spellMaxValue) : (0 - i);
                        sendChat('Spell Tracking','@{'+character.get('name')+'|'+(!isNPC ? 'PC-whisper':'NPC-whisper')+'} &{template:pf_block} '
                        +'@{'+character.get('name')+'|toggle_accessible_flag} @{'+character.get('name')+'|toggle_rounded_flag} '
                        +'{{color=@{'+character.get('name')+'|rolltemplate_color}}} {{subtitle='+(i>0 ? ('<b>INSUFFICIENT SPELLCASTING</b>') : '')+'}} '
                        +'{{name='+(spontaneous ? 'Level '+spellLevel+' Spells Used' : 'Prepared @{'+character.get('name')+'|'+attrToID+'_name} Remaining')+'}} '
                        +'{{hasuses=1}} {{qty='+(spontaneous ? spellMax.get('current')+'}} {{qty_max='+spellMax.get('max')+'}}' : spellUsedAttr.get('current')+'}} '
                        +'{{qty_max=-}}')+'{{description=@{'+character.get('name')+'|'+attrToID+'_description}}}');
                    }).catch((e)=>{log(e)});
                    //msgResourceState(character,(),rowID,0,((0-insufficient)||0),spellUsedAttr);
                }
            }).catch((e)=>{log(e)});
        }
    },
    
    handleAbilityCommand = function(ability,character,abilityClass,changeCurrent,changeMax){
        var attributes=findObjs({type:'attribute',characterid:character.id}),
            abilityNameAttr,rowID,abilityAttr,insufficient;
        
        abilityNameAttr = _.find(attributes,(a)=>{return a.get('name').match(/repeating_ability_[^_]+_name/) && a.get('current')===ability});
        rowID = abilityNameAttr ? extractRowID(abilityNameAttr.get('name')) : undefined;
        abilityAttr = rowID ? _.find(attributes,(a)=>{return a.get('name')===('repeating_ability_'+rowID+'_used')}) : undefined;
        if(abilityAttr){
            changeMax ? setResource(abilityAttr,true,changeMax) : undefined;
            insufficient = changeCurrent ? setResource(abilityAttr,false,changeCurrent) : 0;
            insufficient.then((i)=>{
                msgResourceState(character,(getAttrByName(character.id,'is_npc')==='0' ? false : true),rowID,0,((0-i)||0),abilityAttr);
            });
        }
    },
    
    handleNoteCommand = async function(note,character,changeCurrent){
        var attributes = findObjs({type:'attribute',characterid:character.id}),
            isNPC = getAttrByName(character.id,'is_npc')==='0' ? false : true,
            noteNameAttr,rowID,noteAttr,insufficient;
            
        noteNameAttr = _.find(attributes,(a)=>{return a.get('current')===note && a.get('name').match(/custom[ac]\d+-name/)});
        rowID = noteNameAttr ? noteNameAttr.get('name').match(/(?:custom([abc]\d+)-name)/) : undefined;
        rowID = rowID ? (!rowID[1].match(/10|11|12/) ? rowID[1] : undefined) : undefined;
        noteAttr = rowID ? _.find(attributes,(a)=>{return a.get('name')==='custom'+rowID+'-mod'}) : undefined;
        if(!noteAttr){
            return;
        }
        insufficient = changeCurrent ? await setResource(noteAttr,false,changeCurrent) : 0;
        insufficient = insufficient*-1;
        sendChat('Resource Tracking','@{'+character.get('name')+'|'+(!isNPC ? 'PC-whisper':'NPC-whisper')+'} &{template:pf_block} @{'+character.get('name')+'|toggle_accessible_flag} @{'+character.get('name')+'|toggle_rounded_flag} {{color=@{'+character.get('name')+'|rolltemplate_color}}} '
        +'{{subtitle='+(insufficient>0 ? ('``<b>INSUFFICIENT '+note+'</b>``<br>'+insufficient+' short') : '')+'}} {{name=Remaining '+note+'}} {{hasuses=1}} {{qty='+noteAttr.get('current')+'}} {{qty_max='+((parseInt(noteAttr.get('max'))>0 && noteAttr.get('max')!=='') ? noteAttr.get('max') : '-')+'}}');
    },
    
    msgResourceState = function(character,isNPC,resourceId,resourceUsed,insufficient,resourceAttr){
        var attrToID = resourceAttr.get('name').match(/(?:(repeating_.+_-[^_]+)_.+)/);
        attrToID = attrToID ? attrToID[1] : undefined;
        if(!attrToID){
            return;
        }
        sendChat('Resource Tracking','@{'+character.get('name')+'|'+(!isNPC ? 'PC-whisper':'NPC-whisper')+'} &{template:pf_block} @{'+character.get('name')+'|toggle_accessible_flag} @{'+character.get('name')+'|toggle_rounded_flag} {{color=@{'+character.get('name')+'|rolltemplate_color}}} '
            +'{{subtitle='+(insufficient>0 ? ('``<b>INSUFFICIENT @{'+character.get('name')+'|'+attrToID+'_name}</b>``<br>'+(resourceUsed-insufficient)+' available') : '')+'}} {{name=Remaining @{'+character.get('name')+'|'+attrToID+'_name}}} {{hasuses=1}} {{qty='+resourceAttr.get('current')+'}} {{qty_max='+((parseInt(resourceAttr.get('max'))>0 && resourceAttr.get('max')!=='') ? resourceAttr.get('max') : '-')+'}}'
            +(!attrToID.match(/spell/) ? ('{{shortdesc=@{'+character.get('name')+'|'+attrToID+'_short-description}}}') : '')+' {{description=@{'+character.get('name')+'|'+attrToID+'_description}}}');
    },
    
    //                  Roll20Attr  Bool string
    setResource = function(attribute,max,change,withWorker,altMax){
        var ops = {
                '+': (a,b)=>a+b,
                '-': (a,b)=>a-b,
                '=': (a,b)=>b
            },
            rowID = extractRowID(attribute.get('name')),
            adj=(''+change).trim().match(/([+-]?)([\d]+)/),
            nVal,returnValue,maxValue,spellClass,waiter,promiseTest;
        if((''+change).toLowerCase()==='max'){
            nVal = altMax ? altMax : attribute.get('max');
        }else if(adj){
            adj[2]=parseInt(adj[2],10);
            adj[1]=adj[1]||'=';
            nVal = ops[adj[1]](parseInt((max ? attribute.get('max') : attribute.get('current'))),adj[2]);
            maxValue = altMax ? altMax : attribute.get('max');
            returnValue = _.clone(nVal);
            nVal = Math.max(((max || parseInt(maxValue)=== 0 || maxValue.length===0) ? nVal : Math.min(nVal,maxValue)),0);
        }
        if(nVal || nVal === 0){
            waiter = new Promise((resolve,reject)=>{
                withWorker ? onSheetWorkerCompleted(()=>{
                    resolve(returnValue);
                }) : resolve(returnValue);
            });
            withWorker ? attribute.setWithWorker((max ? 'max' : 'current'),nVal) : attribute.set((max ? 'max' : 'current'),nVal);
        }else{
            waiter = Promise.resolve(0);
        }
        return waiter;
    },
    
    
    handleAmmo = function(ammo,mainAmmo,offAmmo,attributes,character,msg,rollId){
        var ammoId,ammoCount,ammoUsed,ammoQuery,insufficient,
            mainAmmoId,offAmmoId,mainCount,offCount,mainName,offName,mainId,offId,attackNames,mainInsuf,offInsuf,mainQuery,offQuery,
            mainUsed=0,
            offUsed=0,
            macroTextObject,macroText,
            isNPC = getAttrByName(character.id,'is_npc')==='0' ? false : true;
            
        if(mainAmmo && offAmmo){
            if(mainAmmo === offAmmo){
                ammo = mainAmmo;
                mainAmmo = undefined;
                offAmmo = undefined;
            }
        }
        ammo ? _.some(attributes,(a)=>{
            return (ammoId = (a.get('name').match(/repeating_item_[^_]+_name/) && a.get('current')===ammo) ? a.get('name').match(/(?:repeating_item_([^_]+)_name)/)[1] : undefined);
        }) : undefined;
        mainAmmo ? _.some(attributes,(a)=>{
            return (mainAmmoId = (a.get('name').match(/repeating_item_[^_]+_name/) && a.get('current')===mainAmmo) ? a.get('name').match(/(?:repeating_item_([^_]+)_name)/)[1] : undefined);
        }) : undefined;
        offAmmo ? _.some(attributes,(a)=>{
            return (offAmmoId = (a.get('name').match(/repeating_item_[^_]+_name/) && a.get('current')===offAmmo) ? a.get('name').match(/(?:repeating_item_([^_]+)_name)/)[1] : undefined);
        }) : undefined;
        if(ammoId){
            ammoCount = _.find(attributes,(a)=>{return a.get('name')===('repeating_item_'+ammoId+'_qty')});
            ammoUsed = msg.content.match(/attack\d*=/g) ? msg.content.match(/attack\d*=/g).length : undefined;
            if(!ammoUsed){
                return;
            }
            _.each(msg.content.match(/{{attack\d+name=[^}]+}}/g),(m)=>{
                ammoUsed += m.match(/manyshot/i) ? 1 : 0;
            });
            insufficient = ammoUsed-ammoCount.get('current');
            setResource(ammoCount,false,'-'+ammoUsed);
            msgResourceState(character,isNPC,ammoId,ammoUsed,insufficient,ammoCount);
            macroText = _.find(attributes,(a)=>{
                return (a.get('name').toLowerCase().indexOf((rollId.toLowerCase()+((isNPC && a.get('name').indexOf('item')===-1) ? '_npc-macro-text' : '_macro-text')))>-1 && a.get('name').toLowerCase().indexOf('-show')===-1);
            });
            ammoQuery = macroText ? (macroText.get('current').match(/(?:\|\|item=(\?{Name of Ammunition Item})\|\|)/) ? macroText.get('current').match(/(?:\|\|item=(\?{Name of Ammunition Item})\|\|)/)[1] : undefined) : undefined;
            if(ammoQuery==='?{Name of Ammunition Item}'){
                macroText.set('current',macroText.get('current').replace(ammoQuery,ammo));
            }
        }else if(mainAmmoId || offAmmoId){
            mainId = getAttrByName(character.id,'repeating_weapon_'+rollId+'_source-main');
            offId = getAttrByName(character.id,'repeating_weapon_'+rollId+'_source-off');
            mainName = mainId ? _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_weapon_'+mainId.toLowerCase()+'_name'}) : undefined;
            mainName = mainName ? mainName.get('current') : undefined;
            offName = offId ? _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_weapon_'+offId.toLowerCase()+'_name'}) : undefined;
            offName = offName ? offName.get('current') : undefined;
            mainCount = _.find(attributes,(a)=>{return a.get('name')===('repeating_item_'+mainAmmoId+'_qty')});
            offCount = _.find(attributes,(a)=>{return a.get('name')===('repeating_item_'+offAmmoId+'_qty')});
            attackNames = msg.content.match(/attack\dname*=([^}]+)\d+}}/g);
            _.each(attackNames,(n)=>{
                mainUsed += n.match(/attack\dname*=([^}]+)\d+}}/)[1].trim()===mainName.trim() ? 1 : 0;
                mainUsed += n.match(/manyshot/i) ? 2 : 0;
                offUsed += n.match(/attack\dname*=([^}]+)\d+}}/)[1].trim()===offName.trim() ? 1 : 0;
            });
            if(!(mainUsed || offUsed)){
                return;
            }
            
            mainInsuf = mainUsed ? mainUsed-mainCount.get('current') : undefined;;
            offInsuf = offUsed ? offUsed-offCount.get('current') : undefined;
            mainUsed ? setResource(mainCount,false,'-'+mainUsed) : undefined;
            offUsed ? setResource(offCount,false,'-'+offUsed) : undefined;
            mainUsed ? msgResourceState(character,isNPC,mainAmmoId,mainUsed,mainInsuf,mainCount) : undefined;
            offUsed ? msgResourceState(character,isNPC,offAmmoId,offUsed,offInsuf,offCount) : undefined;
            macroTextObject = _.find(attributes,(a)=>{
                return (a.get('name').toLowerCase().indexOf((rollId.toLowerCase()+((isNPC && a.get('name').indexOf('item')===-1) ? '_npc-macro-text' : '_macro-text')))>-1 && a.get('name').toLowerCase().indexOf('-show')===-1);
            });
            macroText = macroTextObject ? macroTextObject.get('current') : undefined;
            ammoQuery = macroText ? (macroText.match(/(?:\|\|item=(\?{Name of Ammunition Item})\|\|)/) ? macroText.match(/(?:\|\|item=(\?{Name of Ammunition Item})\|\|)/)[1] : undefined) : undefined;
            mainQuery = macroText ? (macroText.match(/(?:\|\|mainitem=(\?{Mainhand Ammunition})\|\|)/) ? macroText.match(/(?:\|\|mainitem=(\?{Mainhand Ammunition})\|\|)/)[1] : undefined) : undefined;
            offQuery = macroText ? (macroText.match(/(?:\|\|offitem=(\?{Offhand Ammunition})\|\|)/) ? macroText.match(/(?:\|\|offitem=(\?{Offhand Ammunition})\|\|)/)[1] : undefined) : undefined;
            if(ammoQuery==='?{Name of Ammunition Item}'){
                macroText = macroText.replace(ammoQuery,ammo);
            }
            if(mainQuery==='?{Mainhand Ammunition}'){
                macroText = macroText.replace(mainQuery,mainAmmo);
            }
            if(offQuery==='?{Offhand Ammunition}'){
                macroText = macroText.replace(offQuery,offAmmo);
            }
            macroTextObject.set('current',macroText);
        }
    },
    
    //Chat Listener for responding to non-api commands
    //                  Roll20msg
    listener = function(msg){
        var ammo,mainAmmo,offAmmo,
            attributes,character,rollId,
            characterId=msg.content.match(/(?:{{character_id=([^}]+)}})/) ? msg.content.match(/(?:{{character_id=([^}]+)}})/)[1] : undefined;
            
        if(!characterId){
            return;
        }
        character = getObj('character',characterId);
        attributes = findObjs({type:'attribute',characterid:characterId});
        rollId = msg.content.match(/(?:\|\|rowid=([^\|]+)\|\|)/) ? msg.content.match(/(?:\|\|rowid=([^\|]+)\|\|)/)[1] : undefined;
        if(!rollId){
            return;
        }
        if(msg.rolltemplate==='pf_attack'){
            ammo = msg.content.match(/(?:\|\|item=([^\s][^\|]+))/) ? msg.content.match(/(?:\|\|item=([^\s][^\|]+))/)[1] : undefined;
            mainAmmo = msg.content.match(/(?:\|\|mainitem=([^\s][^\|]+))/) ? msg.content.match(/(?:\|\|mainitem=([^\s][^\|]+))/)[1] : undefined;
            offAmmo = msg.content.match(/(?:\|\|offitem=([^\s][^\|]+))/) ? msg.content.match(/(?:\|\|offitem=([^\s][^\|]+))/)[1] : undefined;
            if(ammo || mainAmmo || offAmmo){
                handleAmmo(ammo,mainAmmo,offAmmo,attributes,character,msg,rollId);
            }
        }
    },
    
    showHelp = function(who){
        sendChat('Pathfinder Companion','/w "'+who+'" <b><u>[Access The Help Sheet](https://journal.roll20.net/handout/'+state.PFCompanion.helpLink+')</u></b>');
    },
    
    HandleInput = function(msg_orig) {
        var msg = _.clone(msg_orig),
            who = idToDisplayName(msg.playerid),
			args,cmdDetails,characters,folders;
			
        if(msg.type !== 'api'){
            if(msg.rolltemplate){
                if(msg.rolltemplate.indexOf('pf')===0){
                    if(_.has(msg,'inlinerolls')){//calculates inline rolls
                        msg.content = _.chain(msg.inlinerolls)
                            .reduce(function(m,v,k){
                                m['$[['+k+']]']=v.results.total || 0;
                                return m;
                            },{})
                            .reduce(function(m,v,k){
                                return m.replace(k,v);
                            },msg.content)
                            .value();
                    }
                    listener(msg);
                }
            }
            return;
        }else if(!playerIsGM(msg.playerid) || msg.content.indexOf('!pfc')!==0){
            return
        }
        
        if(_.has(msg,'inlinerolls')){//calculates inline rolls
			msg.content = _.chain(msg.inlinerolls)
				.reduce(function(m,v,k){
					m['$[['+k+']]']=v.results.total || 0;
					return m;
				},{})
				.reduce(function(m,v,k){
					return m.replace(k,v);
				},msg.content)
				.value();
		}
		args = msg.content.split(/\s+--/);//splits the message contents into discrete arguments
		args.shift();
		args.length===0 ? showHelp(who) : _.each(args,(a)=>{
            cmdDetails = cmdExtract(a);
            switch(cmdDetails.action){
                case 'help':
                    break;
                case 'config':
                    break;
                //!pfc --resource[,item=AMMONAME][,spelllevel/spellname=#/SPELLNAME][,ability=ABILITYNAME][,current=X/+/-X][,max=X/+/-X]|Character id|character id|...
                case 'resource':
                    if(cmdDetails.things.length>0){
                        characters = _.chain(cmdDetails.things)
                            .map((t)=>{return getObj('character',t.trim())})
                            .reject((c)=>{return _.isUndefined(c)})
                            .value();
                    }else if(msg.selected){
                        characters = _.chain(msg.selected)
                            .map((s)=>{return getObj('graphic',s._id)})
                            .map((t)=>{return getObj('character',t.get('represents'))})
                            .value();
                    }
                    if(characters && (cmdDetails.details.current || cmdDetails.details.max)){
                        if(cmdDetails.details.note){
                            _.each(characters,(c)=>{handleNoteCommand(cmdDetails.details.note,c,cmdDetails.details.current,cmdDetails.details.max)})
                        }
                        if(cmdDetails.details.item){
                            _.each(characters,(c)=>{handleAmmoCommand(cmdDetails.details.item,c,cmdDetails.details.current,cmdDetails.details.max)});
                        }
                        if(cmdDetails.details.spell){
                            _.each(characters,(c)=>{handleSpellCommand(cmdDetails.details.spell,c,cmdDetails.details.class,cmdDetails.details.current)});
                        }
                        if(cmdDetails.details.ability){
                            _.each(characters,(c)=>{handleAbilityCommand(cmdDetails.details.ability,c,cmdDetails.details.class,cmdDetails.details.current,cmdDetails.details.max)});
                        }
                    }
                    break;
                case 'rest':
                    break;
                case 'TAS':
                    characters = cmdDetails.things.length>0 ? _.reject(_.map(cmdDetails.things,(t)=>{
                            return getObj('character',t);
                        }),(m)=>{
                            return _.isUndefined(m);
                        }) : (msg.selected ? _.reject(_.map(msg.selected,(t)=>{
                            return getObj('character',getObj('graphic',t._id).get('represents'));
                        }),(m)=>{
                            return _.isUndefined(m);
                        }) : undefined);
                    if(characters){
                        if(characters.length!==cmdDetails.things.length){
                            if(_.some(cmdDetails.things,(t)=>{return t==='ALL'})){
                                characters = findObjs({type:'character'});
                            }else{
                                folders = Campaign().get('journalfolder').length>0 ? JSON.parse(Campaign().get('journalfolder')) : '';
                                if(folders.length>0){
                                    _.each(cmdDetails.things,(t)=>{
                                        _.some(folders,(f)=>{
                                            if(f.n===t){
                                                _.each(f.i,(i)=>{
                                                    characters.push(getObj('character',i));
                                                });
                                            }
                                        });
                                    });
                                    characters = _.reject(characters,(c)=>{return _.isUndefined(c)});
                                }
                            }
                        }
                        _.each(characters,(c)=>{
                            tokenActionMaker(c,cmdDetails.details.limit,cmdDetails.details.ignore);
                        });
                    }else{
                        showHelp(who);
                    }
                    break;
		    }
		});
	},
	
	cmdExtract = function(cmd){
        var cmdSep = {
                details:{}
            },
            vars,details;
            
        cmdSep.things = cmd.split('|');
        details = cmdSep.things.shift();
        cmdSep.things=_.map(cmdSep.things,(t)=>{
            return t.trim();
        });
        cmdSep.action = details.match(/config|help|TAS|resource|rest/);
        if(cmdSep.action){
            cmdSep.action = cmdSep.action[0];
        }
        _.each(details.replace(cmdSep.action+',','').split(','),(d)=>{
            vars=d.match(/(limit|ignore|item|spell|class|ability|note|current|max)(?:\:|=)([^,]+)/) || null;
            if(vars){
                cmdSep.details[vars[1]]= (vars[1]==='limit'||vars[1]==='ignore') ? vars[2].split(/\s+/) : vars[2];
            }else{
                cmdSep.details[d]=d;
            }
        });
        return cmdSep;
    },
    
    extractRowID = function(name){
        return name.match(/(?:_(-[^_]+)_)/) ? name.match(/(?:_(-[^_]+)_)/)[1] : undefined;
    },
    
    characterHandler = function(obj){
        state.PFCompanion.TAS === 'auto' ? tokenActionMaker(obj) : undefined;
        state.PFCompanion.ResourceTrack ? _.defer(initializeCharacterResourceTracking,obj) : undefined;
    },
    
    attributeHandler = function(obj,event,prev){
        switch(event){
            case 'change':
                if(obj.get('name')==='is_npc'){
                    if(obj.get('current')!==prev.current && state.PFCompanion.TAS === 'auto'){
                        tokenActionMaker(getObj('character',obj.get('characterid')));
                        if(state.PFCompanion.ResourceTrack){
                            initializeCharacter(getObj('character',obj.get('characterid')));
                        }
                    }
                }else if(obj.get('name').match('_ammo')){
                    if(state.PFCompanion.ResourceTrack && parseInt(obj.get('current'))!==0 && parseInt(prev.current)===0){
                        initializeRepeatingResourceTracking(extractRowID(obj.get('name')),findObjs({type:'attribute',characterid:obj.get('characterid')}));
                    }else if(!state.PFCompanion.ResourceTrack || parseInt(obj.get('current'))===0 && parseInt(obj.prev)!==0){
                        deleteAmmoTracking(extractRowID(obj.get('name')),findObjs({type:'attribute',characterid:obj.get('characterid')}));
                    }
                }else if(obj.get('name').match(/spellclass-[012]-casting_type|repeating_ability_-.+_name|repeating_ability_-.+_hasuses|repeating_item_-.+_name/)){
                    _.defer(initializeCharacter,getObj('character',obj.get('characterid')));
                }else if(obj.get('name').match(/_-.+_description|_-.+_notes/)){
                    _.defer(checkForCustomTracking,obj);
                }
                break;
            case 'add':
                if(obj.get('name').match(/repeating_[^_]+_-[^_]+_name|repeating_[^_]+_-[^_]+_spell_level|repeating_[^_]+_-[^_]+_spellclass_number|repeating_[^_]+_-[^_]+_source-.+|repeating_[^_]+_-[^_]+_ammo/)){
                    setTimeout(()=>{
                        initializeRepeatingResourceTracking(extractRowID(obj.get('name')),findObjs({type:'attribute',characterid:obj.get('characterid')}));
                    },0);
                }else if(obj.get('name').match(/_-.+_description|_-.+_notes/)){
                    _.defer(checkForCustomTracking,obj);
                }
                break;
            case 'destroy':
                break;
        }
    },
    
    RegisterEventHandlers = function() {
        //message handling
        on('chat:message', HandleInput);
        
        //attribute handling
        on('change:attribute',(obj,prev)=>{attributeHandler(obj,'change',prev)});
        on('add:attribute',(obj,prev)=>{attributeHandler(obj,'add',prev)});
        
        //character handling
        on('add:character',characterHandler);
    };
    
    return {
        CheckInstall: checkInstall,
    	RegisterEventHandlers: RegisterEventHandlers
	};
    
}());


on("ready",function(){
    'use strict';
    
    PFCompanion.CheckInstall();
    PFCompanion.RegisterEventHandlers();
});
