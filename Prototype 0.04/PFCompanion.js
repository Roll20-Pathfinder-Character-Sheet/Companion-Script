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

    var version = '0.04',
        lastUpdate = 1493146677,
        schemaVersion = 0.04,

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
    
    checkInstall = function() {
        //state.PFCompanion.TAS = 'manual';
        //state.PFCompanion.ResourceTrack = true;
        log('-=> Pathfinder Companion v'+version+' || Compatible with Sheet Version 1.0<=-  ['+(new Date(lastUpdate*1000))+']');
        if( ! _.has(state,'PFCompanion') || state.PFCompanion.version !== schemaVersion) {
            log('  > Updating Schema to v'+schemaVersion+' <');
            state.PFCompanion = state.PFCompanion || {};
            state.PFCompanion.version = schemaVersion;
		};
		initialize();
	},
    
    initialize = async function(){
        var characters;
            
        characters=findObjs({type:'character'});
        //populate macro text with appropriate ammo, ability, and spell handling syntax
        for(var i = 0;i<characters.length;i++){
            await initializeCharacterResourceTracking(characters[i]);
            log('  > Pathfinder Companion: '+characters[i].get('name')+' initialized <')
        }
        log('  > Pathfinder Companion: Initialization Completed <');
    },
    
    initializeCharacterResourceTracking = function(c){
        var attributes = findObjs({type:'attribute',characterid:c.id}),
            rollIds;
            
        return new Promise((resolve,reject)=>{
            _.defer((a)=>{
                rollIds = _.filter(attributes,(a)=>{
                    return a.get('name').indexOf('repeating_')===0 && a.get('name').match(/(?:_([^_]+)_name)/);
                });
                _.each(rollIds,(r)=>{
                    r.get('name').match(/(?:_([^_]+)_name)/) ? initializeRepeatingResourceTracking(r.get('name').match(/(?:_([^_]+)_name)/)[1],attributes) : undefined;
                });
                resolve('initialized');
            });
        },attributes);
    },
    
    //                                          string   [Roll20attr]
    initializeRepeatingResourceTracking = function(r,attributes){
        if(!r || !attributes){
            return;
        }
        var sourceSpell,sourceAbility,usesAmmo,rollTemplate,
            macroTextName,macroText,macroTextObject,
            toAdd = '',
            weaponText = '&{template:pf_attack} @{toggle_attack_accessible} @{toggle_rounded_flag} {{color=@{rolltemplate_color}}} {{character_name=@{character_name}}} {{character_id=@{character_id}}} {{subtitle}} {{name=@{name}}} {{attack=[[ 1d20cs>[[ @{crit-target} ]] + @{attack_macro} ]]}} {{damage=[[@{damage-dice-num}d@{damage-die} + @{damage_macro}]]}} {{crit_confirm=[[ 1d20 + @{attack_macro} + [[ @{crit_conf_mod} ]] ]]}} {{crit_damage=[[ [[ @{damage-dice-num} * (@{crit-multiplier} - 1) ]]d@{damage-die} + ((@{damage_macro}) * [[ @{crit-multiplier} - 1 ]]) ]]}} {{type=@{type}}} {{weapon_notes=@{notes}}} @{iterative_attacks} @{macro_options} {{vs=@{vs}}} {{vs@{vs}=@{vs}}} {{precision_dmg1=@{precision_dmg_macro}}} {{precision_dmg1_type=@{precision_dmg_type}}} {{precision_dmg2=@{global_precision_dmg_macro}}} {{precision_dmg2_type=@{global_precision_dmg_type}}} {{critical_dmg1=@{critical_dmg_macro}}} {{critical_dmg1_type=@{critical_dmg_type}}} {{critical_dmg2=@{global_critical_dmg_macro}}} {{critical_dmg2_type=@{global_critical_dmg_type}}} {{attack1name=@{iterative_attack1_name}}}',
            spellText = '&{template:pf_spell} @{toggle_spell_accessible} @{toggle_rounded_flag} {{color=@{rolltemplate_color}}} {{header_image=@{header_image-pf_spell}}} {{name=@{name}}} {{character_name=@{character_name}}} {{character_id=@{character_id}}} {{subtitle}} {{deafened_note=@{SpellFailureNote}}} @{spell_options} ',
            abilityText = '&{template:pf_ability} @{toggle_accessible_flag} @{toggle_rounded_flag} {{color=@{rolltemplate_color}}} {{header_image=@{header_image-pf_ability}}} {{character_name=@{character_name}}} {{character_id=@{character_id}}} {{subtitle=^{@{rule_category}}}} {{name=@{name}}} {{rule_category=@{rule_category}}} {{source=@{class-name}}} {{is_sp=@{is_sp}}} {{hasspellrange=@{range_pick}}} {{spell_range=^{@{range_pick}}}} {{casterlevel=[[@{casterlevel}]]}} {{spell_level=[[@{spell_level}]]}} {{hasposrange=@{hasposrange}}} {{custrange=@{range}}} {{range=[[@{range_numeric}]]}} {{save=@{save}}} {{savedc=[[@{savedc}]]}} {{hassr=@{abil-sr}}} {{sr=^{@{abil-sr}}}} {{hasfrequency=@{hasfrequency}}} {{frequency=^{@{frequency}}}} {{next_cast=@{rounds_between}}} {{hasuses=@{hasuses}}} {{uses=@{used}}} {{uses_max=@{used|max}}} {{cust_category=@{cust-category}}} {{concentration=[[@{Concentration-mod}]]}} {{damage=@{damage-macro-text}}} {{damagetype=@{damage-type}}} {{hasattack=@{hasattack}}} {{attacktype=^{@{abil-attacktypestr}}}} {{targetarea=@{targets}}} {{duration=@{duration}}} {{shortdesc=@{short-description}}} {{description=@{description}}} {{deafened_note=@{SpellFailureNote}}}',
            itemText = '&{template:pf_block} @{toggle_accessible_flag} @{toggle_rounded_flag} {{color=@{rolltemplate_color}}} {{header_image=@{header_image-pf_block-item}}} {{character_name=@{character_name}}} {{character_id=@{character_id}}} {{subtitle}} {{name=@{name}}} {{hasuses=@{has_uses}}} {{qty=@{qty}}} {{qty_max=@{qty_max}}} {{shortdesc=@{short-description}}} {{description=@{description}}}',
            isNPC = getAttrByName(attributes[0].get('characterid'),'is_npc')==='0' ? false : true,
            duplicate;
            
        macroTextName = _.find(attributes,(a)=>{
            return (a.get('name').toLowerCase().indexOf(r.toLowerCase()+'_name')>-1);
        });
        macroTextName = macroTextName ? macroTextName.get('name').replace('name',((isNPC && macroTextName.get('name').indexOf('item')===-1) ? 'NPC-macro-text' : 'macro-text')) : undefined;
        macroTextObject = macroText ? _.find(attributes,(a)=>{return a.get('name')===macroTextName}) : createObj('attribute',{
            characterid:attributes[0].get('characterid'),
            name:macroTextName,
            current:(isNPC ? '@{NPC-whisper} ' : '@{PC-whisper} ')+(macroTextName.indexOf('repeating_weapon_')===0 ? weaponText : (macroTextName.indexOf('repeating_spell')===0 ? spellText : (macroTextName.indexOf('repeating_ability')===0 ? abilityText : (macroTextName.indexOf('repeating_item')===0 ? itemText : ''))))
        });
        macroText = macroTextObject ? macroTextObject.get('current') : undefined;
        sourceSpell = _.find(attributes,(a)=>{
            return a.get('name').toLowerCase().indexOf(r.toLowerCase()+'_source-spell')>-1;
        });
        sourceAbility = _.find(attributes,(a)=>{
            return a.get('name').toLowerCase().indexOf(r.toLowerCase()+'_source-ability')>-1;
        });
        usesAmmo = _.find(attributes,(a)=>{
            return a.get('name').toLowerCase().indexOf(r.toLowerCase()+'_ammo')>-1;
        });
        rollTemplate = macroTextObject ? (macroText.match(/(?:&{template:([^}]+)})/) ? macroText.match(/(?:&{template:([^}]+)})/)[1] : undefined)  : undefined;
        if(macroTextObject && rollTemplate){
            toAdd+= (!macroText.match(/\|\|rowid=[^\|]+\|\|/) ? '||rowid='+r+'||' : '')
                +((!macroText.match(/\|\|spellid=@{source-spell}\|\|/) && sourceSpell) ? '||spellid=@{source-spell}||' : '')
                +((!macroText.match(/\|\|abilityid=@{source-ability}\|\|/) && sourceAbility) ? '||abilityid=@{source-ability}||' : '')
                +((!macroText.match(/\|\|ammo=[^\|]+\|\|/) && usesAmmo) ? '||ammo=?{Name of Ammunition Item}||' : '');
            (toAdd.length>2 && rollTemplate) ? macroTextObject.set('current',macroText.replace('&{template:'+rollTemplate+'} ','&{template:'+rollTemplate+'} '+toAdd+' ')) : undefined;
        }
    },
    
    deleteAmmoTracking = function(r,attributes){
        var macroTextName = _.find(attributes,(a)=>{return a.get('name').indexOf(r+'_name')>0}),
            isNPC = getAttrByName(attributes[0].get('characterid'),'is_npc')==='0' ? false : true,
            macroTextObject,ammoString;
            
        macroTextName = macroTextName ? macroTextName.get('name').replace('name',(macroTextName.get('name').indexOf('item')=== -1 && isNPC ? 'NPC-macro-text' : 'macro-text')) : undefined;
        macroTextObject = macroTextName ? _.find(attributes,(a)=>{return a.get('name')===macroTextName}) : undefined;
        ammoString = macroTextObject ? macroTextObject.get('current').match(/\|\|ammo=([^\|]+)\|\|/) : undefined;
        (macroTextObject && ammoString) ? macroTextObject.set('current',macroTextObject.get('current').replace(ammoString[0],'')) : undefined;
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
    
    showHelp = function(who){
        sendChat('Pathfinder Companion Prototype','/w "'+who+'" Only two chat commands are implemented currently.<br>'
        +'<b>Token action setup wizard:</b> Command syntax is<br>!pfc --TAS,ignore=menu-type-to-ignore menu-type-to-ignore ...,limit=only-make-this-menu only-make-this-menu ...|characterid/foldername|characterid/foldername|...<br>'
        +'Script will look for selected tokens representing characters if no character id or folder name is passed in the command<br><br>'
        +'<b>Resource Manipulation:</b> Full command syntax will be (currently only ammo is implemented)<br>!pfc --resource[,ammo=AMMONAME][,spelllevel/spellname=#/SPELLNAME][,ability=ABILITYNAME][,current=X/+/-X][,max=X/+/-X]|Character id|character id|...<br>'
        +'As with TAS, script will look for selected tokens if now characterid is passed. The AMMONAME must be the name of an inventory item. The current and max arguments can be any integer, an addition/subtraction expression, or "max"(case insensitive). Passing max will set that value to the value in the max of that attribute.Can also use inline rolls here.<br><br>'
        +'<b>Ammo Tracking:</b> If state.PFCompanion.ResourceTrack is set to true (uncomment the appropriate line in checkInstall) the script will look for any repeating weapon sections whose ammo attribute is not 0. It will then add info about the rowID of that repeating section as well as a query about what ammo to use with that attack to the section macro-text field. After this query is answered the first time, it is replaced with the answer. You can enter a different query in the macro-text to have it always ask what ammo to use. The ammo name entered needs to be the name of an inventory item. The script will count the number of attack fields in the outputted roll template. It will also look for any attack names that are manyshot (case insensitive) and increase the amount of ammo used accordingly. It will then deduct that much ammo from the inventory item and then message how much ammo you have remaining/how much ammo you were short by if not enough ammo is present.');
    },
    
    //Ammo Handling
    //                  string [Roll20 Attrs] Roll20Char Roll20msg, string
    handleAmmo = function(ammo,attributes,character,msg,rollId){
        var ammoId,ammoCount,ammoUsed,macroText,ammoQuery,insufficient,
            isNPC = getAttrByName(character.id,'is_npc')==='0' ? false : true;
            
        _.some(attributes,(a)=>{
            return (ammoId = (a.get('name').match(/repeating_item_[^_]+_[^_]+/) && a.get('current')===ammo) ? a.get('name').match(/(?:repeating_item_([^_]+)_[^_]+)/)[1] : undefined);
        });
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
            sendChat('Ammo Tracking','@{'+character.get('name')+'|'+(!isNPC ? 'PC-whisper':'NPC-whisper')+'}&{template:pf_block} @{'+character.get('name')+'|toggle_accessible_flag} @{'+character.get('name')+'|toggle_rounded_flag} {{color=@{'+character.get('name')+'|rolltemplate_color}}} {{header_image=@{'+character.get('name')+'|header_image-pf_block-item}}}'
            +'{{subtitle='+(insufficient>0 ? ('<b>INSUFFICIENT AMMO</b><br>'+(ammoUsed-insufficient)+' @{'+character.get('name')+'|repeating_item_'+ammoId+'_name} available') : '')+'}} {{name=Remaining @{'+character.get('name')+'|repeating_item_'+ammoId+'_name}}} {{hasuses=@{'+character.get('name')+'|repeating_item_'+ammoId+'_has_uses}}} {{qty=@{'+character.get('name')+'|repeating_item_'+ammoId+'_qty}}} {{qty_max='+(parseInt(getAttrByName(character.id,'repeating_item_'+ammoId+'_qty','max'))>0 ? ('@{'+character.get('name')+'|repeating_item_'+ammoId+'_qty|max}') : '-')+'}}'
            +'{{shortdesc=@{'+character.get('name')+'|repeating_item_'+ammoId+'_short-description}}} {{description=@{'+character.get('name')+'|repeating_item_'+ammoId+'_description}}}');
            macroText = _.find(attributes,(a)=>{
                return (a.get('name').toLowerCase().indexOf((rollId.toLowerCase()+((isNPC && a.get('name').indexOf('item')===-1) ? '_npc-macro-text' : '_macro-text')))>-1 && a.get('name').toLowerCase().indexOf('-show')===-1);
            });
            ammoQuery = macroText ? (macroText.get('current').match(/(?:\|\|ammo=(\?{Name of Ammunition Item})\|\|)/) ? macroText.get('current').match(/(?:\|\|ammo=(\?{Name of Ammunition Item})\|\|)/)[1] : undefined) : undefined;
            if(ammoQuery==='?{Name of Ammunition Item}'){
                macroText.set('current',macroText.get('current').replace(ammoQuery,ammo));
            }
        }
    },
    
    handleAmmoCommand = function(ammo,character,changeCurrent,changeMax){
        var attributes=findObjs({type:'attribute',characterid:character.id}),
            ammoNameAttr,rowID,ammoAttr;
            
        ammoNameAttr = _.find(attributes,(a)=>{return a.get('name').match(/repeating_item_[^_]+_name/) && a.get('current')===ammo});
        rowID = ammoNameAttr ? extractRowID(ammoNameAttr.get('name')) : undefined;
        ammoAttr = rowID ? _.find(attributes,(a)=>{return a.get('name')===('repeating_item_'+rowID+'_qty')}) : undefined;
        if(ammoAttr){
            changeMax ? setResource(ammoAttr,true,changeMax) : undefined;
            changeCurrent ? setResource(ammoAttr,false,changeCurrent) : undefined;
        }
    },
    
    //                  Roll20Attr  Bool string
    setResource = function(attribute,max,change){
        var ops = {
                '+': (a,b)=>a+b,
                '-': (a,b)=>a-b,
                '=': (a,b)=>b
            },
            adj=(''+change.trim()).match(/([+-]?)([\d]+)/),
            nVal;
        if(change.toLowerCase()==='max'){
            nVal = attribute.get('max');
        }else if(adj){
            adj[2]=parseInt(adj[2],10);
            adj[1]=adj[1]||'=';
            nVal = ops[adj[1]]((max ? attribute.get('max') : attribute.get('current')),adj[2]);
        }
        if(nVal || nVal === 0){
            attribute.set((max ? 'max' : 'current'),Math.max(((max || parseInt(attribute.get('max'))<= 0) ? nVal : Math.min(nVal,attribute.get('max'))),0));
        }
    },
    
    //Chat Listener for responding to non-api commands
    //                  Roll20msg
    listener = function(msg){
        var ammo,
            spellId,spellAttr,
            abilityId,abilityAttr,
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
        switch(msg.rolltemplate){
            case 'pf_attack':
                ammo = msg.content.match(/(?:\|\|ammo=([^\s][^\|]+))/) ? msg.content.match(/(?:\|\|ammo=([^\s][^\|]+))/)[1] : undefined;
                spellId= msg.content.match(/(?:\|\|spellid=([^\s][^\|]+))/) ? msg.content.match(/(?:\|\|spellid=([^\s][^\|]+))/)[1] : undefined;
                if(ammo){
                    handleAmmo(ammo,attributes,character,msg,rollId);
                }
                if(spellId){
                    
                }
                break;
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
                //!pfc --resource[,ammo=AMMONAME][,spelllevel/spellname=#/SPELLNAME][,ability=ABILITYNAME][,current=X/+/-X][,max=X/+/-X]|Character id|character id|...
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
                    if(characters && cmdDetails.details.ammo && (cmdDetails.details.current || cmdDetails.details.max)){
                        _.each(characters,(c)=>{handleAmmoCommand(cmdDetails.details.ammo,c,cmdDetails.details.current,cmdDetails.details.max)});
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
            vars=d.match(/(limit|ignore|ammo|current|max)(?:\:|=)([^,]+)/) || null;
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
        state.PFCompanion.ResourceTrack ? _.delay(initializeCharacterResourceTracking(obj)) : undefined;
    },
    
    attributeHandler = function(obj,event,prev){
        switch(event){
            case 'change':
                if(obj.get('name')==='is_npc'){
                    if(obj.get('current')!==prev.current && state.PFCompanion.TAS === 'auto'){
                        tokenActionMaker(getObj('character',obj.get('characterid')));
                        if(state.PFCompanion.ResourceTrack){
                            initializeCharacterResourceTracking(getObj('character',obj.get('characterid')));
                        }
                    }
                }else if(obj.get('name').indexOf('_ammo')>0){
                    if(state.PFCompanion.ResourceTrack && parseInt(obj.get('current'))!==0 && parseInt(prev.current)===0){
                        initializeRepeatingResourceTracking(extractRowID(obj.get('name')),findObjs({type:'attribute',characterid:obj.get('characterid')}));
                    }else if(state.PFCompanion.ResourceTrack || parseInt(obj.get('current'))===0 && parseInt(obj.prev)!==0){
                        deleteAmmoTracking(extractRowID(obj.get('name')),findObjs({type:'attribute',characterid:obj.get('characterid')}));
                    }
                }
                break;
            case 'add':
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
