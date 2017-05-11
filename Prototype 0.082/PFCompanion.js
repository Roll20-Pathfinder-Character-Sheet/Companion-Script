/*
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

    var version = 'Prototype 0.082',
        sheetVersion = 1.51,
        lastUpdate = 1494528640,
        schemaVersion = 0.082,
        defaults = {
            css: {
                button: {
                    'border': '1px solid #cccccc',
                    'border-radius': '1em',
                    'background-color': '#006dcc',
                    'margin': '0 .1em',
                    'font-weight': 'bold',
                    'padding': '.1em 1em',
                    'color': 'white'
                }
            }
        },
        templates = {},
        largeLogo = 'https://s3.amazonaws.com/files.d20.io/images/32553319/jo0tVb8t2Ru02ZoAx_2Trw/max.png?1493959120',
        mediumLogo = 'https://s3.amazonaws.com/files.d20.io/images/32553318/5tI0CxKAK5nh_C6Fb-dYuw/max.png',

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
        log('-=> Pathfinder Companion v'+version+' || Compatible with Sheet Version '+sheetVersion+' <=-  ['+(new Date(lastUpdate*1000))+']');
        if( ! _.has(state,'PFCompanion') || state.PFCompanion.version !== schemaVersion) {
            log('  > Updating Schema to v'+schemaVersion+' <');
            state.PFCompanion = state.PFCompanion || {};
            state.PFCompanion.version = schemaVersion;
		};
		if(state.PFCompanion.TAS === 'auto' || state.PFCompanion.ResourceTrack==='on'){
		    initialize();
		}else{
		    log('  > Pathfinder Companion: No Initialization Options Enabled <');
		}
		generateHelp();
		buildTemplates();
	},
	
	cleanImgSrc = function(img){
        var parts = img.match(/(.*\/images\/.*)(thumb|med|original|max)(.*)$/);
        if(parts) {
            return parts[1]+'thumb'+parts[3];
        }
        return;
    },
	
	/*Makes the API buttons used throughout the script*/
    makeButton = function(command, label, backgroundColor, color){
        return templates.button({
            command: command,
            label: label,
            templates: templates,
            defaults: defaults,
            css: {
                color: color,
                'background-color': backgroundColor
            }
        });
    },
    
    buildTemplates = function() {
        templates.cssProperty =_.template(
            '<%=name %>: <%=value %>;'
        );
        
        templates.style = _.template(
            'style="<%='+
                '_.map(css,function(v,k) {'+
                    'return templates.cssProperty({'+
                        'defaults: defaults,'+
                        'templates: templates,'+
                        'name:k,'+
                        'value:v'+
                    '});'+
                '}).join("")'+
            ' %>"'
        );
          
        templates.button = _.template(
            '<a <%= templates.style({'+
                'defaults: defaults,'+
                'templates: templates,'+
                'css: _.defaults(css,defaults.css.button)'+
                '}) %> href="<%= command %>"><%= label||"Button" %></a>'
        );
    },
	
    generateHelp = function(){
        var notes,gmnotes,
            helpCharacter = state.PFCompanion.helpLink ? getObj('handout',state.PFCompanion.helpLink) : undefined;
        if(!helpCharacter){
            helpCharacter = createObj('handout',{name:'Pathfinder Companion',archived:true,inplayerjournals:'all',avatar:largeLogo});
            state.PFCompanion.helpLink = helpCharacter.id;
        }
        
        notes = '<h2>Companion API Script v'+version+'</h2>'
            +'<p>'
            +'Current macro setup, auto attribute handling and command syntax:'
            +'</p>'
            +'<h4>Automatic Attribute Handling</h4>'
            +'<ul>'
            +"<li><b>HP & Temp HP:</b> If this option is enabled in the config menu health deducted from a character's HP will be deducted from their temp hp first before being applied to their HP. Note this will not work with API applied HP changes (other than those caused by this script).</li>"
            +'</ul>'
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
            +'<li><b>Whisper Adjusting:</b> !pfc --whisper,npc=public/private/swap,pc=public/private/swap,stats=public/private/swap|characerid|characterid|...</li>'
            +'<li><b>Access the Config Menu:</b> !pfc --config</li>'
            +'<li><b>Apply/Remove Buffs Conditions:</b> !pfc --apply,condition=all or part of a condtion name,buff=all or part of a buff name that has already been setup on the character,remove/swap|characterid|characterid|...'
            +'<li><b>Import Statblock:</b> !pfc --parse|characterid|characterid|characterid| OR !pfc --parse|{{statblock NEWCREATURE statblock NEW CREATURE ...}}<br>Copy your statblock (pure text only - copy into a text editor first to clean off formatting) into the gmnotes of a fresh character or directly via chat, and then run the command. I have only tested the parser on pfsrd statblocks (and not many of those) so far, and hope to overcome the issues preventing multiple statblocks from being imported at once, as well as hopefully eventually allowing statblocks to be imported from chat.'
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
    debouncedInitialize = _.debounce(initialize,3000),
    
    initializeCharacter = function(c){
        var attributes = findObjs({type:'attribute',characterid:c.id}),
            rollIds,rowID;
            
        return new Promise((resolve,reject)=>{
            _.defer((a,chr)=>{
                if(state.PFCompanion.TAS === 'auto'){
                    tokenActionMaker(chr);
                }
                if(state.PFCompanion.ResourceTrack==='on'){
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
            duplicateSpell = duplicateSpell ? _.reject(duplicateSpell,(d)=>{return (d.indexOf(sourceSpellName.get('current'))>-1  && d.match(/\[\*\*\+\*\*\]/) && d.match(/\[\*\*-\*\*\]/) && d.match(/\[\*\*\?\*\*\]/) && d.match(character.id))}) : undefined;
        }
        sourceAbility = sourceAbility ? sourceAbility.get('current'):undefined;
        abilityName = sourceAbility ? _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_ability_'+sourceAbility.toLowerCase()+'_name'}) : undefined;
        if(abilityName){
            abilityUses = _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_ability_'+sourceAbility.toLowerCase()+'_hasuses'});
            abilityUses = abilityUses ? (abilityUses.get('current')==='1' ? true : false) : false;
            if(abilityUses){
                abilityButtonField = '{{['+abilityName.get('current')+' Description](~'+character.get('name')+'|'+abilityName.get('name').replace('_name',(isNPC ? '_npc-roll' : '_roll'))+')=[**-**](!pfc --resource,ability='+abilityName.get('current')+',current=-1|'+character.id+')[**+**](!pfc --resource,ability='+abilityName.get('current')+',current=+1|'+character.id+')[**?**](!pfc --resource,ability='+abilityName.get('current')+',current=?'+HE('{')+'Ability Adjustment}|'+character.id+')}}'
                duplicateAbility = macroText.match(/{{\[[^\]]+ Description\]\(~[^\)]+\)=\[\*\*-\*\*\]\([^\)]+\)\[\*\*\+\*\*\]\([^\)]+\)\[\*\*\?\*\*\]\([^\)]+\)}}/g);
                duplicateAbility = duplicateAbility ? _.reject(duplicateAbility,(d)=>{return (d.indexOf('ability='+abilityName.get('current'))>-1  && d.match(/\[\*\*\+\*\*\]/) && d.match(/\[\*\*-\*\*\]/) && d.match(/\[\*\*\?\*\*\]/) && d.match(character.id))}) : undefined;
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
        duplicateSpell = duplicateSpell ? _.reject(duplicateSpell,(d)=>{return (d.indexOf(spellName.get('current'))>-1  && d.match(/\[\*\*\+\*\*\]/) && d.match(/\[\*\*-\*\*\]/) && d.match(/\[\*\*\?\*\*\]/) && d.match(character.id))}) : undefined;
        rollTemplate = macroText.match(/(?:&{template:(.*)})/) ? macroText.match(/(?:&{template:([^}]+)})/)[1] : undefined;
        toAdd = (macroText.indexOf(spellButtonField)===-1 && spellButtonField.length>0 && spontaneous!==undefined) ? spellButtonField : '';
        duplicateSpell ? _.each(duplicateSpell,(d)=>{macroText = macroText.replace(d,'')}) : undefined;
        macroText = toAdd.length>0 ? macroText.replace('&{template:'+rollTemplate+'} ','&{template:'+rollTemplate+'} '+toAdd+' ') : macroText;
        macroTextObject.set('current',macroText);
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
        _.each(duplicate,(d)=>{
            macroText = (!d.match('='+abilityName.get('current')+',') || !hasUses || !d.match(character.id)) ? macroText.replace(d+' ','') : macroText;
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
        duplicate = duplicate ? _.reject(duplicate,(d)=>{return d.indexOf(itemName.get('current'))>-1 && d.match(character.id)}) : undefined;
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
            npcAbilities = ['NPC-ability_checks','NPC-Initiative-Roll','NPC-defenses','NPC-attacks','NPC-abilities','NPC-combat_skills','NPC-skills','NPC-items'],
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
        if(!spellClass && spellClass !==0){
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
                        +'{{qty_max=-}}'));
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
    
    setWhisperState = function(character,pcWhisper,npcWhisper,statsWhisper){
        var attributes = findObjs({type:'attribute',characterid:character.id}),
            swapper = {
                '/w gm':'public',
                'nbsp;':'private'
            },
            pcAttr,npcAttr,statsAttr;
            
        pcAttr = _.find(attributes,(a)=>{return a.get('name')==='PC-whisper'});
        npcAttr = _.find(attributes,(a)=>{return a.get('name')==='NPC-whisper'});
        statsAttr = _.find(attributes,(a)=>{return a.get('name')==='STATS-whisper'});
        pcAttr = pcAttr ? pcAttr : createObj('attribute',{characterid:character.id,name:'PC-whisper',current:'&'+'nbsp'+';'});
        npcAttr = npcAttr ? npcAttr : createObj('attribute',{characterid:character.id,name:'NPC-whisper',current:'/w gm'});
        statsAttr = statsAttr ? statsAttr : createObj('attribute',{characterid:character.id,name:'STATS-whisper',current:'/w gm'});
        pcWhisper = pcWhisper==='swap' ? swapper[pcAttr.get('current').replace('&','')]: pcWhisper;
        npcWhisper = npcWhisper==='swap' ? swapper[npcAttr.get('current').replace('&','')] : npcWhisper;
        statsWhisper = statsWhisper==='swap' ? swapper[statsAttr.get('current').replace('&','')] : statsWhisper;
        pcAttr.set('current',(pcWhisper ? (pcWhisper.toLowerCase()==='private' ? '/w gm' : (pcWhisper.toLowerCase()==='public' ? '&'+'nbsp'+';' : pcAttr.get('current'))) : pcAttr.get('current')));
        npcAttr.set('current',(npcWhisper ? (npcWhisper.toLowerCase()==='private' ? '/w gm' : (npcWhisper.toLowerCase()==='public' ? '&'+'nbsp'+';' : npcAttr.get('current'))) : npcAttr.get('current')));
        statsAttr.set('current',(statsWhisper ? (statsWhisper.toLowerCase()==='private' ? '/w gm' : (statsWhisper.toLowerCase()==='public' ? '&'+'nbsp'+';' : statsAttr.get('current'))) : statsAttr.get('current')));
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
    
    handleHP = function(obj,prev){
        var character = getObj('character',obj.get('characterid')),
            attributes = findObjs({type:'attribute',characterid:obj.get('characterid')}),
            hpDifference = parseInt(prev.current) - parseInt(obj.get('current')),
            tempHP,hpForTemp,hpForHP;
            
        if(hpDifference<=0){
            return;
        }
        
        tempHP = _.find(attributes,(a)=>{return a.get('name')==='HP-temp'});
        if(tempHP){
            hpForTemp = parseInt(tempHP.get('current'))>0 ? Math.min(hpDifference,parseInt(tempHP.get('current'))) : 0;
            tempHP.set('current',parseInt(tempHP.get('current'))-hpForTemp);
            obj.set('current',parseInt(obj.get('current'))+hpForTemp);
        }
    },
    
    applyConditions = function(character,condition,buff,swap,remove){
        var attributes = findObjs({type:'attribute',characterid:character.id}),
            swapper = {
                '0':'1',
                '1':'0',
                '2':'0',
                '3':'0',
                '4':'0'
            },
            convertValue = {
                'Blinded':'2',
                'Entangled':'2',
                'Invisible':'2',
                'Cowering':'2',
                'Fear':'2',
                'Pinned':'4',
                'Dazzled':'1',
                'Flat-Footed':'1',
                'Prone':'4',
                'Deafened':'4',
                'Grappled':'2',
                'Sickened':'2',
                'Helpless':'1',
                'Stunned':'2'
            },
            conditionAttributes,conditionAttr,conditionName,
            buffAttr,buffNameAttr,
            toSet;
            
        if(condition){
            conditionName = condition.match(/exhaust|fatigue/i) ? 'fatigue' : condition;
            conditionAttributes = _.filter(attributes,(a)=>{return a.get('name').match(/condition-/)});
            conditionAttr = _.find(conditionAttributes,(ca)=>{return ca.get('name').toLowerCase().match(conditionName.toLowerCase())});
            toSet = condition.match(/exhaust/) ? '3' : (condition.match(/fatigue/) ? '1' : convertValue[conditionAttr.get('name').replace('condition-','')]);
            conditionAttr.setWithWorker('current',(swap ? ''+(parseInt(swapper[conditionAttr.get('current')])*parseInt(toSet)) : (remove ? '0' : convertValue[conditionAttr.get('name').replace('condition-','')])));
        }
        if(buff){
            buffNameAttr = buff ? _.find(attributes,(a)=>{return a.get('name').match(/repeatin_buff_-[^_]+_buff-name/) && a.get('current').toLowerCase().match(buff.toLowerCase())}) : undefined;
            buffAttr = buffNameAttr ? _.find(attributes,(a)=>{return a.get('name').toLowerCase()===buffNameAttr.get('name').toLowerCase().replace('buff-name','buff-enable_toggle')}) : undefined;
            buffAttr.setWithWorker('current',(swap ? swapper[buffAttr.get('current')] : (remove ? '0' : '1')));
        }
    },
    
    statblockHandler = async function(text,characters,who){
        try{
        var block,iChar,blockSection,attributes,
            convert = {
                'defense':[null,'ac_compendium','npc_hp_compendium','fort_compendium','ref_compendium','will_compendium','npc-defensive-abilities','dr_compendium','immunities','resistances','sr_compendium','weaknesses'],
                'offense':[null,'speed_compendium','npc-melee-attacks-text','npc-ranged-attacks-text','space_compendium','reach_compendium','npc-special-attacks','spells',],
                'statistics':[null,'str_compendium','dex_compendium','con_compendium','int_compendium','wis_compendium','cha_compendium','bab_compendium','cmb_compendium','cmd_compendium','npc-feats-text','skills_compendium','racial_mods_compendium','languages','SQ_compendium','gear1','gear2'],
                'tactics':[null,'tactics'],
                'ecology':[null,'ecology'],
                'special abilities':[null,'content_compendium'],
                'gear':[null,'gear'],
                'long description':[null,'long description'],
                'default':[null,'avatar','token','description','character_name','cr_compendium','xp_compendium','class','alignment','size_compendium','type_compendium','subtype','init_compendium','senses_compendium','weaknesses','npc-aura']
            },
            defenseMatch=/DEFENSE\n+(AC\s+[^\n]+)\n+hp\s+([^\n]+)\n+Fort\s+([^,]+),\s+Ref\s+([^,]+),\s+Will\s+([^\n]+)\n+(?:Defensive\s+Abilities\s+([^;\n]+))?[;\n]?(?:\s+DR\s+([^;]+);)?(?:\s+)?(?:Immune\s([^;]+);)?(?:\s+)?(?:Resist\s+([^;]+);)?(?:\s+)?(?:SR\s+(\d+))?(?:\n+)?/,
            offenseMatch=/OFFENSE\n+Speed\s+([^\n]+)\n+(?:Melee\s+([^\n]+)\n+)?(?:Ranged\s+([^\n]+)(?:\n+)?)?(?:Space\s+([^;]+);)?(?:\s+Reach\s+([^\n]+)(?:\n+)?)?(?:Special Attacks\s+([^\n]+))?(?:\n+)?(?:((?:Spell-Like Abilities|Psychic Magic|(?:[^\s\n]+\s+)?Spells Prepared|(?:[^\s\n]+\s+)?Spells Known)\s+.+\n+(?:.+\n+)+))?/,
            tacticsMatch=/(TACTICS\n+.+\n+(?:.+(?:\n+)?)+)/,
            statisticsMatch=/STATISTICS\n+Str\s+([^,]+),\s+Dex\s+([^,]+),\s+Con\s+([^,]+),\s+Int\s+([^,]+),\s+Wis\s+([^,]+),\s+Cha\s+([^\n]+)\n+Base Atk\s+(\+\d+);\s+CMB\s+([^;]+);\s+CMD\s+([^\n]+)(?:\n+)?(?:Feats\s+([^\n]+)(?:\n+)?)?(?:Skills\s+([^\n;]+)(?:;\s+Racial Modifiers\s+([^\n]+))?)(?:\n+)?(?:Languages\s+([^\n]+))?(?:\n+)?(?:SQ\s+([^\n]+))?(?:\n+)?((?:Combat Gear|Other Gear)\s+[^;\n]+|Gear\n(?:.*(?:\n+)?)+)?(?:;)?(Other Gear\s+[^;\n]+)?(?:\n+)?(.*$)?/,
            saMatch=/((?:SPECIAL ABILITIES)\n+(?:.*(?:\n+)?)+)/,
            ecologyMatch=/((?:ECOLOGY)\n+(?:.*(?:\n+)?)+)/,
            defaultMatch=/(?:Avatar\s+([^\n]+)\n+)?(?:Token\s+([^\n]+)\n+)?(?:([^\n]+)\n+)?([^\t]+)(?:\s+)?CR\s+([^\n]+)\n+XP\s+([^\n]+)\n+(?:([\w\s]+\d+)\n+)?(LG|NG|CG|LN|N|CN|LE|NE|CE)\s+(Fine|Diminutive|Tiny|Small|Medium|Large|Huge|Gargantuan|Colossal)\s+([\w\s]+)(?:\s+(\([\w\s,]+\)))?\n+Init\s+([^;]+);\s+Senses\s+([^;]+;\s+Perception\s+[^\n]+)(?:\n+)?(?:Weakness\s+([^\n]+)\n+)?(?:Aura\s+([^\n]+)\n+)?/,
            gearMatch=/((?:GEAR)\n+(?:.*(?:\n+)?)+)/,
            descriptionMatch = /LONG DESCRIPTION\n+((?:.+|\n+)+)/,
            accrue,attributesToSet,description,setAttr,attrWorker,
            charList=[],
            section,keys,parser,parseSection,statBlock,keyWorker,
            start = _.now();
            
        text =_.chain(text.replace(/<br\/>/g,'').replace(/<br>/g,'\n').split(/(?:\n+)?NEW CREATURE(?:\n+)?/))
            .map((t)=>{
                return t.replace(/\ndefense\n/i,'___STATBLOCK PARSE SITE___ DEFENSE\n').replace(/\noffense\n/i,'___STATBLOCK PARSE SITE___ OFFENSE\n').replace(/\ntactics\n/i,'___STATBLOCK PARSE SITE___ TACTICS\n').replace(/\nstatistics\n/i,'___STATBLOCK PARSE SITE___ STATISTICS\n').replace(/\nspecial abilities\n/i,'___STATBLOCK PARSE SITE___ SPECIAL ABILITIES\n').replace(/\necology\n/i,'___STATBLOCK PARSE SITE___ ECOLOGY\n').replace(/\ngear\n/i,'___STATBLOCK PARSE SITE___ GEAR\n').replace(/\nlong description\n/i,'___STATBLOCK PARSE SITE___ LONG DESCRIPTION\n').split('___STATBLOCK PARSE SITE___ ');
            })
            .reject((t)=>{return(_.isUndefined(t) || _.isEmpty(t))})
            .value();
        sendChat('Pathfinder Companion Statblock Parser','/w "'+who+'" Statblock parsing and import of '+text.length+' statblock'+(text.length>1 ? 's':'')+' started. As creatures are successfully parsed, notifications will be sent to chat. Please do not send further API commands until parsing is complete. Newly imported sheets may be unresponsive for a while after import as the sheetworkers finish firing.');
        if(characters){
            if(characters.length<text.length){
                for(var l = characters.length;l<text.length;l++){
                    characters.push(createObj('character',{name:'Character for statblock '+(l+ 1)}));
                }
            }
        }else{
            characters = [];
            for(var l = 0;l<text.length;l++){
                characters.push(createObj('character',{name:'Character for statblock '+(l+ 1)}));
            }
        }
        
        parser = async () =>{
            accrue = {};
            attributesToSet = {};
            description = undefined;
            charList.push(_.clone(characters[0]));
            iChar = characters.shift();
            attributes = findObjs({type:'attribute',characterid:iChar.id});
            await createAttrWithWorker('is_npc',iChar.id,attributes,'1');
            await createAttrWithWorker('config-show',iChar.id,attributes,'0');
            statBlock = text.shift();
            parseSection = async () =>{
                block = statBlock.shift();
                switch(true){
                    case block.indexOf('DEFENSE\n')===0:
                        block=block.match(defenseMatch);
                        break;
                    case block.indexOf('OFFENSE')===0:
                        block=block.match(offenseMatch);
                        break;
                    case block.indexOf('TACTICS')===0:
                        block=block.match(tacticsMatch);
                        break;
                    case block.indexOf('STATISTICS')===0:
                        block=block.match(statisticsMatch);
                        break;
                    case block.indexOf('SPECIAL ABILITIES')===0:
                        block=block.match(saMatch);
                        break;
                    case block.indexOf('ECOLOGY')===0:
                        block=block.match(ecologyMatch);
                        break;
                    case block.indexOf('GEAR')===0:
                        block=block.match(gearMatch);
                        break;
                    case block.indexOf('LONG DESCRIPTION')===0:
                        block = block.match(descriptionMatch);
                        break;
                    default:
                        block=block.match(defaultMatch);
                        break;
                } 
                if(block){
                    section = block[0].match(/^(defense|offense|statistics|tactics|ecology|special abilities|gear|long description)\n/i);
                    section = section ? section[1].toLowerCase() : 'default';
                    for(var r=1;r<block.length;r++){
                        if(block[r]){
                            accrue[convert[section][r]]=_.clone(block[r]);
                            log('  > Pathfinder Companion Statblock Parser:'+convert[section][r]+' parsed <');
                        }
                    }
                    log('  > Pathfinder Companion Statblock Parser:'+section+' section parsed <');
                }
                if(!_.isEmpty(statBlock)){
                    _.defer(parseSection);
                }else{
                    keys = _.keys(accrue);
                    keyWorker = async () =>{
                        try{
                        var k = keys.shift(),
                            gearType,beforeCombat,duringCombat,morale,environment,organization,treasure,charDescrip;
                        
                        switch(true){
                            case (k==='gear'||k==='gear 1'||k==='gear 2'):
                                var gearType = accrue[k].match(/^(GEAR\n+|Gear\s+|Other Gear\s+|Combat Gear\s+)/) ? accrue[k].match(/^(GEAR\n+|Gear\s+|Other Gear\s+|Combat Gear\s+)/)[0] : undefined;
                                accrue[k]=accrue[k].replace(gearType,'');
                                if(gearType.match(/^(GEAR|Gear|Other Gear)/)){
                                    await createAttrWithWorker('npc-other-gear',iChar.id,attributes,accrue[k]);
                                }else{
                                    await createAttrWithWorker('npc-combat-gear',iChar.id,attributes,accrue[k]);
                                }
                                break;
                            case k==='ecology':
                                //description = (description ? description+'<br><br>' : '')+accrue[k];
                                accrue[k] = accrue[k].match(/ECOLOGY\n+(?:Environment\s+([^\n]+)(?:\n+)?)?(?:Organization\s+([^\n]+)(?:\n+)?)?(?:Treasure\s+([^\n]+)(?:\n+)?)?((?:.*|\n+)+)?/);
                                if(accrue[k]){
                                    attributesToSet['environment']=accrue[k][1];
                                    attributesToSet['organization']=accrue[k][2];
                                    attributesToSet['other_items_treasure']=accrue[k][3];
                                }
                                break;
                            case k==='avatar':
                                iChar.set('avatar',cleanImgSrc(accrue[k]));
                                break;
                            case k==='token':
                                //defaulttoken setup
                                break;
                            case k==='description':
                                attributesToSet['character_description'] = accrue[k]+(attributesToSet['character_description'] ? '<br>'+attributesToSet['character_description'] : '');
                                break;
                            case k==='character_name':
                                iChar.set('name',accrue[k].trim());
                                break;
                            case k==='class':
                                attributesToSet['init_compendium']=accrue[k]+(attributesToSet['init_compendium'] ? ' '+attributesToSet['init_compendium'] : '');
                                break;
                            case k==='subtype':
                                attributesToSet['type_compendium']=(attributesToSet['type_compendium'] ? attributesToSet['type_compendium']+'/' : '')+accrue[k];
                                break;
                            case k==='type_compendium':
                                attributesToSet[k]=accrue[k]+(attributesToSet[k] ? '/'+attributesToSet[k] : '');
                                break;
                            case k==='init_compendium':
                                attributesToSet[k]=(attributesToSet[k] ? attributesToSet[k]+' ' : '')+accrue[k];
                                break;
                            case k==='tactics':
                                accrue[k]=accrue[k].match(/TACTICS\n+(?:Before Combat\s+([^\n]+)(?:\n+)?)?(?:During Combat\s+([^\n]+)(?:\n+)?)?(?:Morale\s+([^\n]+)(?:\n+)?)?/);
                                if(accrue[k]){
                                    attributesToSet['npc-before-combat']=accrue[k][1];
                                    attributesToSet['npc-during-combat']=accrue[k][2];
                                    attributesToSet['npc-morale']=accrue[k][3];
                                }
                                break;
                            case k==='add to description':
                                attributesToSet['character_description']=(attributesToSet['character_description'] ? attributesToSet['character_description']+'<br>' : '') + accrue[k];
                                break;
                            case k==='spells':
                                var spellSect = accrue[k].match(/((?:\n)?(?:\w+\s+)?(?:Psychic Magic|Spell-like Abilities|Spells Known|Spells Prepared))/gi);
                                _.each(spellSect,(s)=>{
                                    accrue[k]=accrue[k].replace(s,'___Spell Parse Site___'+s);
                                });
                                accrue[k]=accrue[k].split('___Spell Parse Site___');
                                _.each(accrue[k],(a)=>{
                                    if(a.match(/^(?:\n)?(?:Spell-Like Abilities|Psychic Magic)\s/)){
                                        attributesToSet['npc-spellike-ability-text'] = attributesToSet['npc-spellike-ability-text'] ? attributesToSet['npc-spellike-ability-text']+a : a.replace(/^\n/,'');
                                    }else{
                                        attributesToSet['npc-spells-known-text'] = attributesToSet['npc-spells-known-text'] ? attributesToSet['npc-spells-known-text']+a : a.replace(/^\n/,'');
                                    }
                                });
                                break;
                            case k==='cr_compendium':
                                if(accrue[k].match(/\/MR\s+\d+/)){
                                    var ratings = accrue[k].match(/([^\s]+)\/MR\s+(.+)/);
                                    if(ratings){
                                        attributesToSet['cr_compendium'] = ratings[1];
                                        attributesToSet['npc-mythic-mr'] = ratings[2];
                                        await createAttrWithWorker('mythic-adventures-show',iChar.id,attributes,'1');
                                    }
                                }else{
                                    attributesToSet['cr_compendium'] = accrue[k];
                                }
                                break;
                            case k==='content_compendium':
                                var separated = accrue[k].match(/(SPECIAL ABILITIES\n+(?:[^\(]+\((?:Su|Ex|Sp)\)(?:\n+)?[^\n]+(?:$|\n+))+)/);
                                if(separated){
                                    attributesToSet['content_compendium'] = separated[1];
                                }
                                break;
                            case k==='long description':
                                attributesToSet['character_description'] = (attributesToSet['character_description'] ? attributesToSet['character_description']+'<br>' : '')+accrue[k];
                                break;
                            default:
                                attributesToSet[k] = accrue[k];
                                break;
                        }
                        if(keys.length>0){
                            return new Promise((resolve,reject)=>{
                                _.defer(()=>{
                                    resolve(keyWorker());
                                });
                            });
                        }else{
                            return 'all keys resolved';
                        }
                        }catch(e){
                            log(e.content+' '+e.stack);
                        }
                    };
                    await keyWorker();
                    description = (attributesToSet['character_description'] ? attributesToSet['character_description'] : '')+((attributesToSet['npc-before-combat']||attributesToSet['npc-during-combat']||attributesToSet['npc-morale']) ? '<br><h4>TACTICS</h4>'+(attributesToSet['npc-before-combat'] ? '<b>Before Combat </b>'+attributesToSet['npc-before-combat']+'<br>' : '')+(attributesToSet['npc-during-combat'] ? '<b>During Combat </b>'+attributesToSet['npc-during-combat']+'<br>' : '')+(attributesToSet['npc-morale'] ? '<b>Morale </b>'+attributesToSet['npc-morale']+'<br>' : '') : '')+((attributesToSet['environment']||attributesToSet['organization']||attributesToSet['other_items_treasure']) ? '<br><h4>ECOLOGY</h4>'+(attributesToSet['environment'] ? '<b>Environment </b>'+attributesToSet['environment']+'<br>' : '')+(attributesToSet['organization'] ? '<b>Organization </b>'+attributesToSet['organization']+'<br>' : '')+(attributesToSet['other_items_treasure'] ? '<b>Treasure </b>'+attributesToSet['other_items_treasure']+'<br>' : '') : '');
                    
                    description.length>0 ? iChar.set('gmnotes',(description ? description.replace(/\n/g,'<br>') : '')) : undefined;
                    keys = _.keys(attributesToSet);
                    
                    attrWorker = () =>{
                        let k = keys.shift();
                        setAttr = _.find(attributes,(a)=>{return a.get('name')===k});
                        setAttr ? setAttr.set('current',attributesToSet[k]) : attributes.push(createObj('attribute',{characterid:iChar.id,name:k,current:attributesToSet[k]}));
                        if(!_.isEmpty(keys)){
                            return new Promise((resolve,reject)=>{
                                _.defer(()=>{
                                    resolve(attrWorker());
                                });
                            });
                        }else{
                            return 'all attributes set';
                        }
                    };
                    await attrWorker();
                    await new Promise((resolve,reject)=>{
                        setTimeout((name,id,attr)=>{
                            resolve(createAttrWithWorker(name,id,attr,'1'));
                        },0,'npc_import_now',iChar.id,attributes);
                    });
                    if(!_.isEmpty(attributesToSet['character_description'])){
                        setAttr = _.find(attributes,(a)=>{return a.get('name')==='character_description'});
                        setAttr ? setAttr.set('current',attributesToSet['character_description']) : attributes.push(createObj('attribute',{characterid:iChar.id,name:'character_description',current:attributesToSet['character_description']}));
                    }
                    log('  > Pathfinder Companion Statblock Parser:'+iChar.get('name')+' imported <');
                    sendChat('Pathfinder Companion Statblock Parser','/w "'+who+'" '+iChar.get('name')+' imported',null,{noarchive:true});
                    if(!_.isEmpty(text)){
                        _.defer(parser);
                    }else{
                        log('  > Pathfinder Companion Statblock Parser: '+charList.length+' character'+(charList.length>1 ? 's':'')+' parsed and imported in '+((_.now()-start)/1000)+' seconds');
                        sendChat('Pathfinder Companion Statblock Parser','/w "'+who+'" '+charList.length+' character'+(charList.length>1 ? 's':'')+'  parsed and imported in '+((_.now()-start)/1000)+' seconds',null,{noarchive:true});
                        if(state.PFCompanion.TAS==='auto' || state.PFCompanion.ResourceTrack==='on'){
                            var charToInit;
                            var charInit = async () => {
                                charToInit = charList.shift();
                                await initializeCharacter(charToInit);
                                log('  > Pathfinder Companion Statblock Parser:'+charToInit.get('name')+' initialized <');
                                if(!_.isEmpty(charList)){
                                    _.defer(charInit);
                                }else{
                                    log('  > Pathfinder Companion Statblock Parser: All NPCs initialized. Total import time:'+((_.now()-start)/1000)+' seconds <');
                                }
                            };
                            charInit();
                        }
                    }
                }
            };
            _.defer(parseSection);
        };
        _.defer(parser);
        }catch(err){
            log(err.content+' '+err.stack);
        }
    },
    
    createAttrWithWorker = function(nam,id,attributes,curr,mx){
        var attribute = _.find(attributes,(a)=>{return a.get('name')===nam}),
            retValue = new Promise((resolve,reject)=>{
                onSheetWorkerCompleted(()=>{
                    resolve(attr);
                });
            });
        if(!attribute){
            attribute = createObj('attribute',{characterid:id,name:nam});
            attributes.push(attribute);
        }
        if(curr && mx){
            attribute.setWithWorker({current:curr,max:mx});
        }else if(curr || mx){
            attribute.setWithWorker((mx ? 'max' : 'current'),(mx ? mx : curr));
        }
        return retValue;
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
    
    tokenSetupConfig = function(){
        return '<div style="border-top: 1px solid #000000; border-radius: .2em; background-color: white; padding: .1em .3em;">'//markermsg div start
                +'<p><b>Automatically create token actions for macro menus:</b><div style="float:right;">'+makeButton('!pfc --config,TAS='+(state.PFCompanion.TAS==='auto' ? 'manual' : 'auto')+' --config',(state.PFCompanion.TAS==='auto' ? 'AUTO' : 'MANUAL'),(state.PFCompanion.TAS==='auto' ? 'green' : 'red'),'black')+'</div><div style="clear: both"></div></p>';
    },
    
    resourceConfig = function(){
        return '<div style="border-top: 1px solid #000000; border-radius: .2em; background-color: white; padding: .1em .3em;">'//markermsg div start
                +'<p><b>Automatic Resource Tracking is:</b><div style="float:right;">'+makeButton('!pfc --config,tracking='+(state.PFCompanion.ResourceTrack==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.ResourceTrack==='on' ? 'ON' : 'OFF'),(state.PFCompanion.ResourceTrack==='on' ? 'green' : 'red'),'black')+'</div><div style="clear: both"></div></p>';
    },
    
    hpConfig = function(){
        return '<div style="border-top: 1px solid #000000; border-radius: .2em; background-color: white; padding: .1em .3em;">'//markermsg div start
                +'<p><b>Automatically handle HP changes:</b><div style="float:right;">'+makeButton('!pfc --config,hp='+(state.PFCompanion.hp==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.hp==='on' ? 'ON' : 'OFF'),(state.PFCompanion.hp==='on' ? 'green' : 'red'),'black')+'</div><div style="clear: both"></div></p>';
    },
    
    configAssembler = function(who){
        var menu = '/w "'+who+'" <div style="border: 1px solid black; background-color: white; padding: 3px 3px;">'//overall div for nice formatting of control panel
                    +'<div style="font-weight: bold; border-bottom: 1px solid black;font-size: 130%;">'//Control Panel Header div
                    +'[Pathfinder](https://s3.amazonaws.com/files.d20.io/images/32553318/5tI0CxKAK5nh_C6Fb-dYuw/max.png)<br>Companion API Script v'+version+'<b> Options</b>'
                    +'</div>'+tokenSetupConfig()+resourceConfig()+hpConfig()+'</div>';//end Control Panel Header div
        sendChat('Pathfinder Companion',menu,null,{noarchive:true});
    },
    
    configHandler = function(who,details){
        if(!(details.hp || details.tracking || details.TAS)){
            configAssembler(who);
            return;
        }
        if(details.hp==='on' || details.hp==='off'){
            state.PFCompanion.hp=details.hp;
        }
        if(details.tracking==='on' || details.tracking==='off'){
            state.PFCompanion.ResourceTrack=details.tracking;
            initialize();
        }
        if(details.TAS==='auto' || details.TAS==='manual'){
            state.PFCompanion.TAS=details.TAS;
            initialize();
        }
        if(details.tracking || details.TAS){
            debouncedInitialize();
        }
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
        }else if(msg.content.indexOf('!pfc')!==0){
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
            characters = characters? (characters.length>0 ? characters : undefined) : undefined;
            switch(cmdDetails.action){
                case 'help':
                    showHelp(who);
                    break;
                case 'config':
                    if(playerIsGM(msg.playerid)){
                        configHandler(who,cmdDetails.details);
                    }
                    break;
                //!pfc --resource[,item=AMMONAME][,spelllevel/spellname=#/SPELLNAME][,ability=ABILITYNAME][,current=X/+/-X][,max=X/+/-X]|Character id|character id|...
                case 'resource':
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
                case 'parse':
                    var chatText=[],
                        charText=[];
                    _.each(cmdDetails.things,(t)=>{
                        if(t.match(/^{{/)&&t.match(/}}$/)){
                            chatText.push(t.replace(/^{{|}}$/g,''));
                        }
                    });
                    if(characters){
                        if(msg.selected){
                            characters = _.reject(characters,(c)=>{return _.some(msg.selected,(s)=>{return getObj('graphic',s._id).get('represents') === c.id})});
                        }
                        _.each(characters,(c)=>{
                            charText.push(new Promise((resolve,reject)=>{
                                c.get('gmnotes',(n)=>{
                                    if(n){
                                        if(n!=='null'){
                                            resolve(n);
                                        }else{
                                            resolve('no statblock');
                                        }
                                    }else{
                                        resolve('no statblock');
                                    }
                                });
                            }));
                        });
                        Promise.all(charText).then((t)=>{
                            t=_.reject(t,(arr)=>{return arr==='no statblock'});
                            _.each(t,(arr)=>{chatText.push(arr)});
                            statblockHandler(chatText.join('\nNEW CREATURE\n'),characters,who);
                        });
                    }else{
                        statblockHandler(chatText.join('\nNEW CREATURE\n'),null,who);
                    }
                    break;
                case 'apply':
                    if(characters && (cmdDetails.details.condition || cmdDetails.details.buff)){
                        _.each(characters,(c)=>{
                            applyConditions(c,cmdDetails.details.condition,cmdDetails.details.buff,cmdDetails.details.swap,cmdDetails.details.remove);
                        });
                    }
                    break;
                case 'whisper':
                    _.each(characters,(c)=>{
                        setWhisperState(c,cmdDetails.details.pc,cmdDetails.details.npc,cmdDetails.details.stats);
                    });
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
        cmdSep.action = details.match(/config|help|TAS|resource|rest|whisper|apply|parse/);
        if(cmdSep.action){
            cmdSep.action = cmdSep.action[0];
        }
        details=details.replace(cmdSep.action,'');
        details = details.length>0 ? details.split(',') : undefined;
        _.each(details,(d)=>{
            vars=d.match(/(limit|ignore|item|spell|class|ability|note|current|max|pc|npc|stats|buff|condition|hp|tracking|TAS)(?:\:|=)([^,]+)/) || null;
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
    
    characterHandler = function(obj,event,prev){
        var npcAbilities = ['NPC-spellbook-2','NPC-spellbook-1','NPC-spellbook-0','NPC-ability_checks','NPC-initiative_Roll','NPC-defenses','NPC-attacks','NPC-abilities','NPC-combat_skills','NPC-skills','NPC-items'],
            pcAbilities = ['spellbook-2','spellbook-1','spellbook-0','ability_checks','Roll-for-initiative','defenses','attacks','abilities','combat_skills','skills','items'];
        switch(event){
            case 'add':
                state.PFCompanion.TAS === 'auto' ? tokenActionMaker(obj.id) : undefined;
                state.PFCompanion.ResourceTrack==='on' ? _.defer(initializeCharacter,obj) : undefined;
                break;
            case 'change':
                if(state.PFCompanion.TAS==='auto'){
                    _.each(findObjs({type:'ability',characterid:obj.id}),(a)=>{
                        if(_.some(npcAbilities,(n)=>{return a.get('description')===n})){
                            a.remove();
                        }
                        if(_.some(pcAbilities,(n)=>{return a.get('description')===n})){
                            a.remove();
                        }
                    });
                    tokenActionMaker(obj);
                }
                break;
        }
        
    },
    
    attributeHandler = function(obj,event,prev){
        switch(event){
            case 'change':
                if(obj.get('name')==='is_npc'){
                    if(obj.get('current')!==prev.current){
                        if(state.PFCompanion.TAS === 'auto'){
                            tokenActionMaker(getObj('character',obj.get('characterid')));
                        }
                        if(state.PFCompanion.ResourceTrack==='on'){
                            initializeCharacter(getObj('character',obj.get('characterid')));
                        }
                    }
                }else if(obj.get('name').match('_ammo')){
                    if(state.PFCompanion.ResourceTrack==='on' && parseInt(obj.get('current'))!==0 && parseInt(prev.current)===0){
                        initializeRepeatingResourceTracking(extractRowID(obj.get('name')),findObjs({type:'attribute',characterid:obj.get('characterid')}));
                    }else if(state.PFCompanion.ResourceTrack!=='on' || parseInt(obj.get('current'))===0 && parseInt(obj.prev)!==0){
                        deleteAmmoTracking(extractRowID(obj.get('name')),findObjs({type:'attribute',characterid:obj.get('characterid')}));
                    }
                }else if(state.PFCompanion.ResourceTrack==='on' && obj.get('name').match(/spellclass-[012]-casting_type|repeating_ability_-.+_name|repeating_ability_-.+_hasuses|repeating_item_-.+_name/)){
                    _.defer(initializeCharacter,getObj('character',obj.get('characterid')));
                }else if(state.PFCompanion.ResourceTrack==='on' && obj.get('name').match(/_-.+_description|_-.+_notes/)){
                    _.defer(checkForCustomTracking,obj);
                }else if(obj.get('name')==='HP' && parseInt(obj.get('current'))<parseInt(prev.current) && state.PFCompanion.hp==='on'){
                    handleHP(obj,prev);
                }else
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
        on('add:character',(obj,prev)=>{characterHandler(obj,'add',prev)});
        on('change:character',(obj,prev)=>{characterHandler(obj,'change',prev)});
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
