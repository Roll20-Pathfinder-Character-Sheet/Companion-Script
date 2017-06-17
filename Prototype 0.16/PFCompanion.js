var PFCompanion = PFCompanion || (function() {var scriptStart = new Error;
    scriptStart = scriptStart.stack.match(/^[^\d]+(\d+)/)[1]*1;
    'use strict';
/*
Script: Pathfinder Companion Script for the Neceros Roll20 Sheet
Author: Scott C.
Roll20 Profile:https://app.roll20.net/users/459831/scott-c
User's Manual: https://docs.google.com/document/d/12OWJIiT8RWN6zeyZdpkl3d8_DY7XLVxbVL9QzxyJV_s/edit
Thanks to: The Aaron for helping with figuring out the statblock parsing. Vince for beta testing. Chris and Vince for their work on the sheet

|-------------------|
|-Possible Features-|
|-------------------|
*Database modules
*Feat/Ability/Spell import
*/

    var version = 'Prototype 0.16',
        sheetVersion = [1.62,1.63],
        lastUpdate = 1497709907,
        schemaVersion = 0.16,
        defaults = {
            css: {
                button: {
                    'border': '1px solid #cccccc',
                    'background-color': '#006dcc',
                    'margin': '0 0',
                    'font-weight': 'bold',
                    'padding': '.05em .2em',
                    'color': 'white'
                }
            }
        },
        statusquery = ['red','blue','green','brown','purple','pink','yellow','dead','skull','sleepy','half-heart','half-haze','interdiction','snail',
                            'lightning-helix','spanner','chained-heart','chemical-bolt','deathzone','drink-me','edge-crack','ninja-mask','stopwatch','fishing-net',
                            'overdrive','strong','fist','padlock','three-leaves','fluffy-wing','pummeled','tread','arrowed','aura','back-pain','black-flag',
                            'bleeding-eye','bolt-shield','broken-heart','cobweb','broken-shield','flying-flag','radioactive','trophy','broken-skull','frozen-orb',
                            'rolling-bomb','white-tower','grab','screaming','grenade','sentry-gun','all-for-one','angel-outfit','archery-target'],
        statusColormap = ['#C91010', '#1076c9', '#2fc910', '#c97310', '#9510c9', '#eb75e1', '#e5eb75'],
        templates = {},
        mediumLogo = 'https://s3.amazonaws.com/files.d20.io/images/32553319/jo0tVb8t2Ru02ZoAx_2Trw/max.png',
        largeLogo = 'https://s3.amazonaws.com/files.d20.io/images/32553318/5tI0CxKAK5nh_C6Fb-dYuw/max.png?1493959115',
        currSheet=0,
        sheetCompat,
        tIDs = [],

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
            '(' : '&'+'#40'+';',
            ')' : '&'+'#41'+';'
            //'-' : '&'+'mdash'+';'
        },
        re=new RegExp('('+_.map(_.keys(entities),esRE).join('|')+')','g');
        return function(s){
            return s.replace(re, function(c){ return entities[c] || c; });
        };
    }()),
    
    checkSheetVersion = async function(){
        var character = createObj('character',{name:'Version Check'}),
            sVersion,
            update = await createAttrWithWorker('recalc1',character.id,null,1);
            
        sVersion = await new Promise((resolve,reject)=>{
            _.defer((id)=>{resolve(getAttrByName(id,'PFSheet_Version'))},character.id);
        });
        character.remove();
        return _.indexOf(sheetVersion,sVersion*1)>-1;
    },
    
    checkInstall = async function(){
        var check = await checkSheetVersion();
        if(check || sheetCompat===true){
            sheetCompat=true;
        }else{
            sendChat('Pathfinder Companion','/w gm This version of the Neceros Pathfinder Sheet Companion is only compatible with sheet version '+sheetVersion.join(' or ')
            +'. You do not appear to be using the correct Neceros Pathfinder sheet, please switch to the appropriate sheet, or the companion script for your '
            +'sheet. The script has not initialized and will not respond to events or commands.<br>[Override Compatibility Warning](!pfcoverridecompatibility)',null,{noarchive:true});
            return;
        }
        log('-=> Pathfinder Companion v'+version+' || Compatible with Sheet Version '+sheetVersion.join(' or ')+' <=-  ['+(new Date(lastUpdate*1000))+']');
        if( ! _.has(state,'PFCompanion') || state.PFCompanion.version !== schemaVersion || !_.has(state.PFCompanion,'lastUpdate') || lastUpdate!==state.PFCompanion.lastUpdate) {
            log('  > Updating Schema to v'+schemaVersion+' <');
            state.PFCompanion = state.PFCompanion || {};
            state.PFCompanion.version = schemaVersion;
            state.PFCompanion.lastUpdate = lastUpdate;
            state.PFCompanion.toCreate = state.PFCompanion.toCreate || {};
            state.PFCompanion.npcToCreate = state.PFCompanion.npcToCreate || {};
            state.PFCompanion.markers = state.PFCompanion.markers || {
                'Blinded':'sleepy',
                'Entangled':'fishing-net',
                'Invisible':'ninja-mask',
                'Cowering':'back-pain',
                'Fear':'screaming',
                'Pinned':'lightning-helix',
                'Dazzled':'pummeled',
                'Flat-Footed':'tread',
                'Prone':'arrowed',
                'Deafened':'edge-crack',
                'Grappled':'grab',
                'Sickened':'chemical-bolt',
                'Helpless':'interdiction',
                'Stunned':'stopwatch',
                'Fatigued':'radioactive',
                'Energy Drain':'broken-skull'
            };
            state.PFCompanion.affect = state.PFCompanion.affect || {};
            state.PFCompanion.ResourceTrack = state.PFCompanion.ResourceTrack || 'off';
            state.PFCompanion.mook = state.PFCompanion.mook || 'off';
            if(!_.has(state.PFCompanion.markers,'Energy Drain')){
                state.PFCompanion.markers['Energy Drain']='broken-skull';
            }
            state.PFCompanion.defaultToken=state.PFCompanion.defaultToken || {};
            log('  > Updating active automatic features <');
            initialize();
		};
		/*if(state.PFCompanion.TAS === 'auto' || state.PFCompanion.ResourceTrack==='on'){
		    //initialize();
		}else{
		    log('  > Pathfinder Companion: No Initialization Options Enabled <');
		}*/
		generateHelp();
		buildTemplates();
	},
	
    sendError = function(err){
        var stackMatch = err.stack.match(/apiscript\.js:\d+/g);
        _.each(stackMatch,(s)=>{
            let sMatch = s.match(/\d+/)[0]*1;
            err.stack = err.stack.replace(new RegExp('apiscript\.js:'+sMatch),'apiscript.js:'+(sMatch-scriptStart+ 1));
        });
        log(err.stack);
        var stackToSend = err.stack ? (err.stack.match(/([^\n]+\n[^\n]+)/) ? err.stack.match(/([^\n]+\n[^\n]+)/)[1].replace(/\n/g,'<br>') : 'Unable to parse error') : 'Unable to parse error';
        sendChat('PFC Error Handling','/w gm <div style="border: 1px solid black; background-color: white; padding: 3px 3px;">'//overall div for nice formatting of control panel
            +'<div style="font-weight: bold; border-bottom: 1px solid black;font-size: 130%;">'//Control Panel Header div
            +'[Pathfinder]('+mediumLogo+')<br>Companion API Script v'+version+'<b> Error Handling</b></div>'
            +'<div style="border-top: 1px solid #000000; border-radius: .2em; background-color: white;">'
            +'The following error occurred:<br><pre><div style="color:red"><b>'+err.message+'<br>'+stackToSend+'</b></div></pre>Please post this error report to the <b><u>[Script forum thread](https://trello.com/b/URUKukGw/pathfinder-sheet)</u></b>.'
            +'</div>'
            +'</div>');
    },
	
	cleanImgSrc = function(img){
        var parts = img.match(/(.*\/images\/.*)(thumb|med|original|max)(.*)$/);
        if(parts) {
            return parts[1]+'thumb'+parts[3];
        }
        return;
    },
	
	/*Makes the API buttons used throughout the script*/
    makeButton = function(command, label, backgroundColor, color,tooltip){
        var button = templates.button({
            command: command,
            label: label,
            tooltip: tooltip,
            templates: templates,
            defaults: defaults,
            css: {
                color: color,
                'background-color': backgroundColor
            }
        });
        return button;
    },
    
    makeStatusButton = function(command,status,condition,used,current) {
        var i=_.indexOf(statusquery,status),
        backColor;
        if(used && current){
            backColor = 'purple';
        }else if(used){
            backColor = '#C0C0C0';
        }else if(current){
            backColor = 'green';
        }else{
            backColor = 'transparent';
        }
        command = '<a style="background-color: '+backColor+'; padding: 0;" href="'+command+'">';
        if(i<7) {
            return command + '<div style="width: 24px; height: 24px; '
            +'border-radius:20px; display:inline-block; margin: 0; border:0; cursor: pointer;background-color: '+statusColormap[i]+'"></div></a>';
        }else if(i===7) {
            return command + '<div style="'
            +'font-family:Helvetica Neue,Helvetica, Arial, sans-serif;font-size:31px;font-weight:bold;color: red;width: 24px; height: 24px;'
            +'display:inline-block; margin: 0; border:0; cursor: pointer;background-color:">X</div></a>';
        }else if(i>7){
            return command + '<div style="width: 24px; height: 24px; '
            +'display:inline-block; margin: 0; border:0; cursor: pointer;padding:0;background-image: url(\'https://app.roll20.net/images/statussheet.png\');'
            +'background-repeat:no-repeat;background-position: '+((-34)*(i-8))+'px 0px;"></div></a>';
        }
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
                '}) %> href="<%= command %>"title="<%=tooltip||"" %>"><%= label||"Button" %></a>'
        );
    },
	
    generateHelp = function(){
        var notes,gmnotes,
            helpCharacter = state.PFCompanion.helpLink ? getObj('handout',state.PFCompanion.helpLink) : undefined;
        if(!helpCharacter){
            helpCharacter = createObj('handout',{name:'Pathfinder Companion',archived:true,inplayerjournals:'all',avatar:largeLogo});
            state.PFCompanion.helpLink = helpCharacter.id;
        }
        
        notes = '<h1>Companion API Script v'+version+'</h1>'
            +'<p>'
            +'<h3>Configuration Options</h3>'
            +'<ul>'
            +'<li>Automatically create token actions for macro menus: Enabling this will automatically create the indicated abilities for all PCs and NPCs as they are created or made into NPCs. Enabling the setting adds a menu where you can specify what menus should be created for all characters categorized by PC or NPC.</li>'
            +'<li>Automatic Resource Tracking: Will create handling for automatically tracking ammo for weapons and spell, ability, and item usages.</li>'
            +'<li>Automatically handle HP changes: Enabling this will autodeduct damage from temporary hp before affecting HP. It will also prevent healing from occurring beyond the max HP of a character.</li>'
            +'<li>Maintain PC default tokens: Enabling this option will bring up a table to set what attribute (by case insensitive name) each bar should link to and whether that bar should be visible to players or not. Having this option turned on will also update the default token of a character whenever there is a change made to that character (excluding movement and var value/max changes). NOTE: With this setting enabled, setting a token to represent a character will update the bar links and values to be synced appropriately. This will not be reflected in the token setup pop-up until you reload the menu. Exit the menu by hitting "CANCEL" (NOT "APPLY") and your token will be set as the default token for that character and setup as per the settings in the config menu.</li>'
            +'<li>Apply Condition/Buff statusmarkers: Enabling this will apply the appropriate statusmarker to all tokens representing the buffed/conditioned character if that character is controlled by at least one player. You can designate statusmarkers to use for buffs on a per character basis by using the <b>!pfc --buffstatus</b> command while you have a single token selected or by passing a single character id after (e.g. <b>!pfc --buffstatus|@{Jord Strongbow|character_id}</b>. <b><i><u>NOTE</u></i></b> this setting will not work correctly unless <u>Maintain PC default tokens<u> is enabled'
            +'</ul>'
            +'</p>'
            +'<p>'
            +'<h3>Current macro setup, auto attribute handling and command syntax:</h3>'
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
            +'<li><b>Buff statusmarker wizard:</b> !pfc --buffstatus|characterid<br>The characterid is optional if you have a token representing a character selected. The command only works on a single character; having more than one token selected or passing more than one character id will only act on the first character in the list (this is unpredictable when using selected tokens).'
            +'</ul>';
            
        helpCharacter.set('notes',notes);
    },
    
    initialize = async function(who){
        try{
        var characters;
            
        characters=findObjs({type:'character'});
        //populate macro text with appropriate ammo, ability, and spell handling syntax
        for(var i = 0;i<characters.length;i++){
            await initializeCharacter(characters[i]);
            log('  > Pathfinder Companion: '+characters[i].get('name')+' initialized <')
        }
        log('  > Pathfinder Companion: Initialization Completed <');
        if(who){
            sendChat('Pathfinder Companion','/w "'+who+'" Campaign settings applied',null,{noarchive:true});
        }
        }catch(err){
            sendError(err);
        }
    },
    debouncedInitialize = _.debounce(initialize,3000),
    
    initializeCharacter = function(c){
        try{
        var attributes = findObjs({type:'attribute',characterid:c.id}),
            rollIds,rowID,
            start=_.now(),
            rowWorker = () =>{
                try{
                    var r = rollIds.shift();
                    rowID = r.get('name').match(/(?:_(-[^_]+)_name)/);
                    rowID = rowID ? rowID[1] : undefined;
                    rowID ? initializeRepeatingResourceTracking(rowID,attributes) : undefined;
                    if(_.isEmpty(rollIds)){
                        return 'Rows Completed';
                    }else{
                        if((_.now()-start)/1000 >=20){
                            return new Promise((resolve,reject)=>{
                                _.defer((i)=>{
                                    start = _.now();
                                    resolve(rowWorker())
                                });
                            });
                        }else{
                            return rowWorker();
                        }
                    }
                }catch(err){
                    sendError(err);
                }
            };
        return new Promise((resolve,reject)=>{
            _.defer((a,chr)=>{
                try{
                    if(state.PFCompanion.TAS === 'auto'){
                        tokenActionMaker(chr);
                    }
                    if(state.PFCompanion.ResourceTrack==='on'){
                        rollIds = _.filter(attributes,(a)=>{
                            return a.get('name').indexOf('repeating_')===0 && a.get('name').match(/(?:_([^_]+)_name)/);
                        });
                        if(!_.isEmpty(rollIds)){
                            resolve(rowWorker());
                        }else{
                            resolve('initialized');
                        }
                    }else{
                        resolve('initialized');
                    }
                }catch(err){
                    sendError(err);
                }
            },attributes,c);
        });
        }catch(err){
            sendError(err);
        }
    },
    
    //                                          string   [Roll20attr]
    initializeRepeatingResourceTracking = function(r,attributes){
        try{
        if(!r || !attributes){
            return;
        }
        var macroTextName,macroTextObject,sectionType,rollTemplate,
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
        });
        _.isEmpty(macroTextObject.get('current')) ? macroTextObject.set('current',(isNPC ? '@{NPC-whisper} ' : '@{PC-whisper} ')+(macroTextName.indexOf('repeating_weapon_')===0 ? weaponText : (macroTextName.indexOf('repeating_spell')===0 ? spellText : (macroTextName.indexOf('repeating_ability')===0 ? abilityText : (macroTextName.indexOf('repeating_item')===0 ? itemText : ''))))) : undefined;
        if(sectionType!=='weapon' && sectionType!=='spells' & sectionType!=='item' & sectionType!=='ability'){
            sectionType = 'none';
        }
        rollTemplate = macroTextObject.get('current').match(/&{template:[^}]+}\s*/);
        if(!rollTemplate){
            return;
        }
        rollTemplate = rollTemplate[0];
        !macroTextObject.get('current').match(/\|\|rowid=[^\|]+\|\|/) ? macroTextObject.set('current',macroTextObject.get('current').replace(rollTemplate,rollTemplate.trim()+' ||rowid='+r+'||')) : undefined;
        macroTextObject ? handleSection[(sectionType || 'none')](getObj('character',macroTextObject.get('characterid')),macroTextObject,attributes,isNPC,r) : undefined;
        }catch(err){
            sendError(err);
        }
    },
    
    initializeWeapon = function(character,macroTextObject,attributes,isNPC,rowID){
        try{
        var rollTemplate,
            spellClass,spontaneous,sourceSpellName,duplicateSpell,spellTrackingButtonField,spellDescButtonField,
            mainAmmo,offAmmo,
            actualName,
            sourceSpell = getAttrByName(character.id,macroTextObject.get('name').replace((isNPC ? 'NPC-macro-text' : 'macro-text'),'source-spell')),
            abilityTrackingButtonField,abilityDescButtonField,duplicateAbility,abilityName,abilityFrequency,abilityUses,
            sourceAbility = _.find(attributes,(a)=>{return a.get('name')===macroTextObject.get('name').replace(isNPC ? 'NPC-macro-text' : 'macro-text','source-ability')}),
            usesAmmo = getAttrByName(character.id,macroTextObject.get('name').replace(isNPC ? 'NPC-macro-text' : 'macro-text','ammo'))==='0' ? false : true,
            macroText = macroTextObject.get('current'),
            mainhand = _.find(attributes,(a)=>{return a.get('name')===macroTextObject.get('name').replace(isNPC ? 'NPC-macro-text' : 'macro-text','source-main')}),
            offhand = _.find(attributes,(a)=>{return a.get('name')===macroTextObject.get('name').replace(isNPC ? 'NPC-macro-text' : 'macro-text','source-off')}),
            toAdd = '';
            
        sourceSpellName = sourceSpell ? _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_spells_'+sourceSpell.toLowerCase()+'_name'}) : undefined;
        
        if(sourceSpellName){
            actualName=sourceSpellName.get('current').match(/\[([^\]]+)\]\([^\)]+\)/) ? sourceSpellName.get('current').match(/\[([^\]]+)\]\([^\)]+\)/)[1] : sourceSpellName.get('current');
            spellClass = parseInt(getAttrByName(character.id,'repeating_spells_'+sourceSpell+'_spellclass_number'));
            spontaneous = spellClass>-1 ? (getAttrByName(character.id,'spellclass-'+spellClass+'-casting_type')==='1' ? true : false) : undefined;
            spellTrackingButtonField = spontaneous!==undefined ? ('{{spelltracking1=[**_**](!pfc --resource,spell='+HE(actualName)+',current=-1|'+character.id+')[**&**](!pfc --resource,spell='+HE(actualName)+',current=+1|'+character.id+')[**?**](!pfc --resource,spell='+HE(actualName)+',current=?'+HE('{')+'Spell Adjustment}|'+character.id+')[**1**](!pfc --resource,spell='+HE(actualName)+',current=0|'+character.id+')}}') : '';
            spellDescButtonField = '{{spelldescription1=['+HE(actualName)+' Spell Card](~'+HE(character.get('name'))+'|'+sourceSpellName.get('name').replace('_name',(isNPC ? '_npc-roll' : '_roll'))+')}}';
            duplicateSpell = macroText.match(/{{spelldescription1=.*?(?=}})}}|{{spelltracking1=.*?(?=}})}}/g);
            duplicateSpell = duplicateSpell ? _.reject(duplicateSpell,(d)=>{return (d===spellTrackingButtonField || d===spellDescButtonField)}) : undefined;
        }
        sourceAbility = sourceAbility ? sourceAbility.get('current'):undefined;
        abilityName = sourceAbility ? _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_ability_'+sourceAbility.toLowerCase()+'_name'}) : undefined;
        if(abilityName){
            actualName = abilityName.get('current').match(/\[([^\]]+)\]\([^\)]+\)/) ? abilityName.get('current').match(/\[([^\]]+)\]\([^\)]+\)/)[1] : abilityName.get('current');
            abilityUses = _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_ability_'+sourceAbility.toLowerCase()+'_hasuses'});
            abilityUses = abilityUses ? (abilityUses.get('current')==='1' ? true : false) : false;
            if(abilityUses){
                abilityTrackingButtonField = '{{abilitytracking1=[**_**](!pfc --resource,ability='+HE(actualName)+',current=-1|'+character.id+')[**&**](!pfc --resource,ability='+HE(actualName)+',current=+1|'+character.id+')[**?**](!pfc --resource,ability='+HE(actualName)+',current=?'+HE('{')+'Ability Adjustment}|'+character.id+')[**1**](!pfc --resource,ability='+HE(actualName)+',current=max|'+character.id+')}}'
                abilityDescButtonField = '{{abilitydescription1=['+HE(actualName)+' Description](~'+character.get('name')+'|'+abilityName.get('name').replace('_name',(isNPC ? '_npc-roll' : '_roll'))+')}}';
                duplicateAbility = macroText.match(/{{abilitydescription1=.*?(?=}})}}|{{abilitytracking1=.*?(?=}})}}/g);
                duplicateAbility = duplicateAbility ? _.reject(duplicateAbility,(d)=>{return (d===abilityTrackingButtonField || d===abilityDescButtonField) }) : undefined;
            }
        }
        mainhand = mainhand ? mainhand.get('current') : undefined;
        offhand = offhand ? offhand.get('current') : undefined;
        mainAmmo = mainhand ? _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_weapon_'+mainhand+'_ammo'}) : undefined;
        offAmmo = offhand ? _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_weapon_'+offhand+'_ammo'}) : undefined;
        mainAmmo = mainAmmo ? (mainAmmo.get('current')!=='0' ? true : false) : undefined;
        offAmmo = offAmmo ? (offAmmo.get('current')!=='0' ? true : false) : undefined;
        rollTemplate = macroText.match(/(?:&{template:(.*)})/) ? macroText.match(/(?:&{template:([^}]+)})/)[1] : undefined;
        toAdd += rollTemplate ? (((macroText.indexOf(spellTrackingButtonField)===-1 && spellTrackingButtonField && spontaneous!==undefined) ? spellTrackingButtonField : '')
                +((macroText.indexOf(spellDescButtonField)===-1 && spellDescButtonField && spontaneous!==undefined) ? spellDescButtonField : '')
                +((macroText.indexOf(abilityTrackingButtonField)===-1 && abilityTrackingButtonField) ? abilityTrackingButtonField : '')
                +((macroText.indexOf(abilityDescButtonField)===-1 && abilityDescButtonField) ? abilityDescButtonField : '')
                +((!macroText.match(/\|\|item=.+\|\||\|\|mainitem=.+\|\||\|\|offitem=.+\|\|/) && (usesAmmo||offAmmo||mainAmmo)) ? ((mainAmmo || offAmmo) ? ((mainAmmo ? '||mainitem=?{Mainhand Ammunition}||' : '')+(offAmmo ? '||offitem=?{Offhand Ammunition}||' : '')) : '||item=?{Name of Ammunition Item}||') : '')) : '';
        duplicateSpell ? _.each(duplicateSpell,(d)=>{macroText = macroText.replace(d,'')}) : undefined;
        duplicateAbility ? _.each(duplicateAbility,(d)=>{
            macroText = macroText.replace(d,'');
        }) : undefined;
        macroText = toAdd.length>0 ? macroText.replace('&{template:'+rollTemplate+'} ','&{template:'+rollTemplate+'} '+toAdd+' ') : macroText;
        (toAdd.length>0 || !_.isEmpty(duplicateAbility) || !_.isEmpty(duplicateSpell)) ? macroTextObject.set('current',macroText) : undefined;
        }catch(err){
            sendError(err);
        }
    },
    
    initializeSpell = function(character,macroTextObject,attributes,isNPC,rowID){
        try{
        var rollTemplate,spontaneous,duplicateSpell,toAdd,itemQuery,spellButtonField,actualName,
            itemButtonField = '',
            macroText = macroTextObject.get('current'),
            spellClass = parseInt(getAttrByName(character.id,'repeating_spells_'+rowID+'_spellclass_number')),
            spellName = _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_spells_'+rowID.toLowerCase()+'_name'});
            
        if(!spellName){
            return;
        }
        actualName = spellName.get('current').match(/\[([^\]]+)\]\([^\)]+\)/) ? spellName.get('current').match(/\[([^\]]+)\]\([^\)]+\)/)[1] : spellName.get('current');
        spontaneous = spellClass>-1 ? (getAttrByName(character.id,'spellclass-'+spellClass+'-casting_type')==='1' ? true : false) : undefined;
        if(spontaneous===undefined || !spellName){
            return;
        }
        spellButtonField = spontaneous!==undefined ? ('{{spelltracking1=[**_**](!pfc --resource,spell='+HE(actualName)+',current=-1|'+character.id+')[**&**](!pfc --resource,spell='+HE(actualName)+',current=+1|'+character.id+')[**?**](!pfc --resource,spell='+HE(actualName)+',current=?'+HE('{')+'Spellcasting Adjustment}|'+character.id+')[**1**](!pfc --resource,spell='+HE(actualName)+',current=0|'+character.id+')}}') : '';
        duplicateSpell = macroText.match(/{{spelltracking1=.*?(?=}})}}/g);
        duplicateSpell = duplicateSpell ? _.reject(duplicateSpell,(d)=>{return d===spellButtonField}) : undefined;
        rollTemplate = macroText.match(/(?:&{template:(.*)})/) ? macroText.match(/(?:&{template:([^}]+)})/)[1] : undefined;
        toAdd = (macroText.indexOf(spellButtonField)===-1 && spellButtonField.length>0 && spontaneous!==undefined) ? spellButtonField : '';
        duplicateSpell ? _.each(duplicateSpell,(d)=>{macroText = macroText.replace(d,'')}) : undefined;
        macroText = toAdd.length>0 ? macroText.replace('&{template:'+rollTemplate+'} ','&{template:'+rollTemplate+'} '+toAdd+' ') : macroText;
        macroTextObject.set('current',macroText);
        }catch(err){
            sendError(err);
        }
    },
    
    initializeAbility = function(character,macroTextObject,attributes,isNPC,rowID){
        try{
        var rollTemplate,duplicate,abilityButtonField,duplicate,hasUses,actualName,
            macroText = macroTextObject.get('current'),
            toAdd = '',
            abilityName = _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_ability_'+rowID.toLowerCase()+'_name'});
            
        if(!abilityName){
            return;
        }
        actualName = abilityName.get('current').match(/\[([^\]]+)\]\([^\)]+\)/) ? abilityName.get('current').match(/\[([^\]]+)\]\([^\)]+\)/)[1] : abilityName.get('current');
        hasUses = getAttrByName(character.id,'repeating_ability_'+rowID+'_hasuses') === '1' ? true : false;
        
        abilityButtonField = '{{abilitytracking1=[**_**](!pfc --resource,ability='+HE(actualName)+',current=-1|'+character.id+')[**&**](!pfc --resource,ability='+HE(actualName)+',current=+1|'+character.id+')[**?**](!pfc --resource,ability='+HE(actualName)+',current=?'+HE('{')+'Ability Adjustment}|'+character.id+')[**1**](!pfc --resource,ability='+HE(actualName)+',current=max|'+character.id+')}}';
        duplicate = macroText.match(/{{abilitytracking1=.*?(?=}})}}/g);
        duplicate = duplicate ? _.reject(duplicate,(d)=>{return d===abilityButtonField}) : undefined;
        duplicate ? _.each(duplicate,(d)=>{macroText = macroText.replace(d,'')}) : undefined;
        toAdd = (macroText.indexOf(abilityButtonField)===-1 && abilityButtonField && hasUses) ? abilityButtonField : '';
        rollTemplate = macroText.match(/(?:&{template:(.*)})/) ? macroText.match(/(?:&{template:([^}]+)})/)[1] : undefined;
        macroText = toAdd!=='' ? macroText.replace('&{template:'+rollTemplate+'} ','&{template:'+rollTemplate+'} '+toAdd+' ') : macroText;
        macroText!=='' ? macroTextObject.set('current',macroText) : undefined;
        }catch(err){
            sendError(err);
        }
    },
    
    initializeItem = function(character,macroTextObject,attributes,isNPC,rowID){
        try{
        var rollTemplate,duplicate,itemButtonField,actualName,
            macroText = macroTextObject.get('current'),
            toAdd = '',
            itemName = _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_item_'+rowID.toLowerCase()+'_name'});
        if(!itemName){
            return;
        }
        actualName = itemName.get('current').match(/\[([^\]]+)\]\([^\)]+\)/) ? itemName.get('current').match(/\[([^\]]+)\]\([^\)]+\)/)[1] : itemName.get('current');
        itemButtonField = '{{itemtracking1=[**_**](!pfc --resource,item='+HE(actualName)+',current=-1|'+character.id+')[**&**](!pfc --resource,item='+HE(actualName)+',current=+1|'+character.id+')[**?**](!pfc --resource,item='+HE(actualName)+',current=?'+HE('{')+HE(actualName)+' Adjustment}|'+character.id+')[**1**](!pfc --resource,item='+HE(actualName)+',current=max|'+character.id+')}}';
        duplicate = macroText.match(/{{itemtracking1=.*?(?=}})}}/g);
        duplicate = duplicate ? _.reject(duplicate,(d)=>{return d===itemButtonField}) : undefined;
        duplicate ? _.each(duplicate,(d)=>{macroText = macroText.replace(d,'')}) : undefined;
        rollTemplate = macroText.match(/(?:&{template:(.*)})/) ? macroText.match(/(?:&{template:([^}]+)})/)[1] : undefined;
        toAdd = (macroText.indexOf(itemButtonField)===-1 && itemButtonField) ? itemButtonField : '';
        (toAdd || !_.isEmpty(duplicate)) ? macroTextObject.set('current',macroText.replace('&{template:'+rollTemplate+'} ','&{template:'+rollTemplate+'} '+toAdd+' ')) : undefined;
        }catch(err){
            sendError(err);
        }
    },
    
    checkForCustomTracking = function(description){
        try{
        var rowID = extractRowID(description.get('name')),actualName,
            attributes = findObjs({type:'attribute',characterid:description.get('characterid')}),
            sectionType = description.get('name').match(/weapon|spells|item|ability/) ? description.get('name').match(/weapon|spells|item|ability/)[0] : undefined,
            isNPC = getAttrByName(description.get('characterid'),'is_npc')==='0' ? false: true,
            ct = description.get('current').match(/\s*%%[^%]+%%\s*/g),
            customTrackCommand = {
                'item':'item',
                'spells':'spell',
                'ability':'ability',
                'custom':'misc'
            },
            moneyCommand = {
                'CP':'Copper',
                'SP':'Silver',
                'GP':'Gold',
                'PP':'Platinum'
            },
            money = ['gold|GP','copper|CP','silver|SP','platinum|PP'],
            spellPointsClass,spellClass,
            fieldNum=2,
            macroObject,macroText,currentCustomTracking,customTrackType,trackObject,customTrackField,customDescField,rollTemplate,moneyTrack,ctWorker;
            
        if(!ct){
            return;
        }
        ctWorker = ()=>{
            let customTrack = ct.shift();
            description.set('current',description.get('current').replace(customTrack,'').trim());
            customTrack = customTrack.replace(/%/g,'').trim();
            if(customTrack.match(/spell\s*points/i)){
                spellPointsClass = customTrack.match(/(.*?(?=\s+spell\s*points))\s+spell\s*points/);
                if(!spellPointsClass){return}
                spellPointsClass = spellPointsClass[1];
                if(spellPointsClass.match(/^[0-2]$/)){
                    trackObject = _.find(attributes,(a)=>{return a.get('name')==='spellclass-'+spellPointsClass+'-spell-points-per-day'});
                    spellClass = trackObject ? getAttrByName(trackObject.get('characterid'),trackObject.get('name').replace('spell-points-per-day','name')) : undefined;
                }else{
                    spellClass = _.find(attributes,(a)=>{return a.get('name').match(/spellclass-[0-2]-name/)&&a.get('current')===spellPointsClass});
                    trackObject = spellClass ? _.find(attributes,(a)=>{return a.get('name')===spellClass.get('name').replace('name','spell-points-per-day')}) : undefined;
                    spellClass = spellClass ? spellClass.get('current') : undefined;
                }
                if(!trackObject){return}
                macroObject =  _.find(attributes,(a)=>{return a.get('name').toLowerCase()===description.get('name').toLowerCase().replace((sectionType==='weapon' ? 'notes' : 'description'),((isNPC && sectionType!=='ability') ? 'npc-macro-text' : 'macro-text'))});
                macroText = macroObject.get('current');
                rollTemplate = macroText.match(/&{template:[^}]+}/) ? macroText.match(/&{template:[^}]+}/)[0] : undefined;
                currentCustomTracking = macroText ? macroText.match(new RegExp('{{miscdescription\\d='+spellClass+' Spell Points}}','i')) : undefined;
                if(!currentCustomTracking){
                    _.some(_.range(1,7),r=>{
                        if(macroText.match(new RegExp('{{misctracking'+r+'=|{{miscdescription'+r+'='))){
                            return false;
                        }else{
                            fieldNum=r;
                            return true;
                        }
                    });
                    if(!fieldNum){return}
                    customTrackField = '{{misctracking'+fieldNum+'=[**_**](!pfc --resource,misc='+HE(spellClass)+' Spell Points,current=-1|'+description.get('characterid')+')[**&**](!pfc --resource,misc='+HE(spellClass)+' Spell Points,current=+1|'+description.get('characterid')+')[**?**](!pfc --resource,misc='+HE(spellClass)+' Spell Points,current=?'+HE('{')+HE(spellClass)+' Spell Points Adjustment}|'+description.get('characterid')+')[**1**](!pfc --resource,misc='+HE(spellClass)+' Spell Points,current=max|'+description.get('characterid')+')}}';
                    customDescField = '{{miscdescription'+fieldNum+'='+HE(spellClass)+' Spell Points}}';
                    macroText = rollTemplate ? macroText.replace(rollTemplate,rollTemplate+' '+customTrackField+' '+customDescField) : macroText;
                    macroObject.set('current',macroText);
                }else{
                    sendChat('Resource Tracking','/w "'+getObj('character',description.get('characterid')).get('name')+'" There is already resource tracking handling for '+customTrack+' in the macro.');
                }
            }else{
                trackObject = !_.some(money,(m)=>{
                    if(customTrack.match(new RegExp(m,'i'))){
                        trackObject = _.find(attributes,(a)=>{return a.get('name')===((customTrack.match(/other/) ? 'other-' : '')+m.replace(/[^\|]+\|/,''))});
                        return moneyTrack = true;
                    }else{
                        return false;
                    }
                }) ? _.find(attributes,(a)=>{return a.get('current')===customTrack && a.get('name').match(/repeating_.+_-.+_name|custom[ac]\d+-name/)}) : trackObject;
                
                if(!trackObject){
                    return;
                }
                macroObject =  _.find(attributes,(a)=>{return a.get('name').toLowerCase()===description.get('name').toLowerCase().replace((sectionType==='weapon' ? 'notes' : 'description'),((isNPC && sectionType!=='ability') ? 'npc-macro-text' : 'macro-text'))});
                macroText = macroObject.get('current');
                rollTemplate = macroText.match(/&{template:[^}]+}/) ? macroText.match(/&{template:[^}]+}/)[0] : undefined;
                if(moneyTrack){
                    customTrackType = trackObject ? (trackObject.get('name').match(/[CSGP]P/) ? trackObject.get('name').match(/[CSGP]P/)[0] : undefined) : undefined;
                    currentCustomTracking = macroObject ? macroObject.get('current').match(new RegExp('{{miscdescription\\d='+(trackObject.get('name').match(/other/) ? 'other ' : '')+moneyCommand[customTrackType]+'}}','i')) : undefined;
                    if(!currentCustomTracking){
                        _.some(_.range(1,7),r=>{
                            if(macroText.match(new RegExp('{{misctracking'+r+'=|{{miscdescription'+r+'='))){
                                return false;
                            }else{
                                fieldNum=r;
                                return true;
                            }
                        });
                        if(!fieldNum){return}
                        customTrackField = '{{misctracking'+fieldNum+'=[**_**](!pfc --resource,misc='+(customTrack.match(/other/i) ? 'Other ' : '')+customTrackType+',current=-1|'+description.get('characterid')+')[**&**](!pfc --resource,misc='+(customTrack.match(/other/i) ? 'other ' : '')+customTrackType+',current=+1|'+description.get('characterid')+')[**?**](!pfc --resource,misc='+(customTrack.match(/other/i) ? 'other ' : '')+customTrackType+',current=?'+HE('{')+customTrack+' Adjustment}|'+description.get('characterid')+')}}';
                        customDescField = '{{miscdescription'+fieldNum+'='+(customTrack.match(/other/i) ? 'Other ' : '')+moneyCommand[customTrackType]+'}}';
                        macroText = rollTemplate ? macroText.replace(rollTemplate,rollTemplate+' '+customTrackField+' '+customDescField) : macroText;
                        macroObject.set('current',macroText);
                    }else{
                        sendChat('Resource Tracking','/w "'+getObj('character',description.get('characterid')).get('name')+'" There is already resource tracking handling for '+customTrack+' in the macro.');
                    }
                }else{
                    customTrackType = trackObject ? (trackObject.get('name').match(/spells|item|ability|custom/) ? trackObject.get('name').match(/spells|item|ability|custom/)[0] : undefined) : undefined;
                    currentCustomTracking = macroObject ? macroObject.get('current').match(new RegExp('{{'+customTrackCommand[customTrackType]+'description\\d='+customTrack+'}}','i')) : undefined;
                    if(!currentCustomTracking){
                        _.some(_.range((customTrackCommand[customTrackType]==='misc' ? 1 : 2),7),r=>{
                            if(macroText.match(new RegExp('{{'+customTrackCommand[customTrackType]+'tracking'+r+'=|{{'+customTrackCommand[customTrackType]+'description'+r+'='))){
                                return false;
                            }else{
                                fieldNum=r;
                                return true;
                            }
                        });
                        if(!fieldNum){return}
                        customTrackField = '{{'+customTrackCommand[customTrackType]+'tracking'+fieldNum+'=[**_**](!pfc --resource,'+customTrackCommand[customTrackType]+'='+HE(customTrack)+',current=-1|'+description.get('characterid')+')[**&**](!pfc --resource,'+customTrackCommand[customTrackType]+'='+HE(customTrack)+',current=+1|'+description.get('characterid')+')[**?**](!pfc --resource,'+customTrackCommand[customTrackType]+'='+HE(customTrack)+',current=?'+HE('{')+HE(customTrack)+' Adjustment}|'+description.get('characterid')+')[**1**](!pfc --resource,'+customTrackCommand[customTrackType]+'='+HE(customTrack)+',current='+(customTrackCommand[customTrackType]==='spell' ? 0 : 'max')+'|'+description.get('characterid')+')}}';
                        customDescField = '{{'+customTrackCommand[customTrackType]+'description'+fieldNum+'='+(customTrackCommand[customTrackType] === 'misc' ? customTrack : '['+HE(customTrack)+' Card](~'+trackObject.get('characterid')+'|'+trackObject.get('name').replace('name','roll')+')')+'}}';
                        macroText = rollTemplate ? macroText.replace(rollTemplate,rollTemplate+' '+customTrackField+' '+customDescField) : macroText;
                        macroObject.set('current',macroText);
                    }else{
                        sendChat('Resource Tracking','/w "'+getObj('character',description.get('characterid')).get('name')+'" There is already resource tracking handling for '+customTrack+' in the macro.');
                    }
                }
            }
            if(!_.isEmpty(ct)){
                ctWorker();
            }
        };
        ctWorker();
        }catch(err){
            sendError(err);
        }
    },
    
    deleteAmmoTracking = function(r,attributes){
        try{
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
        }catch(err){
            sendError(err);
        }
    },
	
	idToDisplayName = function(id){
        var player = getObj('player', id);
        if(player){
            return player.get('displayname');
        }else{
            return 'gm';
        }
    },
    
    //Ammo Handling
    //                  string [Roll20 Attrs] Roll20Char Roll20msg, string
    
    handleAmmoCommand = function(ammo,character,changeCurrent,changeMax){
        try{
        var attributes=findObjs({type:'attribute',characterid:character.id}),
            ammoNameAttr,rowID,ammoAttr,insufficient,actualName;
            
        ammoNameAttr = _.find(attributes,(a)=>{
            if(a.get('name').match(/repeating_item_[^_]+_name/)){
                actualName = a.get('current').match(/\[([^\]]+)\]\([^\)]+\)/) ? a.get('current').match(/\[([^\]]+)\]\([^\)]+\)/)[1] : a.get('current');
                return  actualName===ammo;
            }
        });
        rowID = ammoNameAttr ? extractRowID(ammoNameAttr.get('name')) : undefined;
        ammoAttr = rowID ? _.find(attributes,(a)=>{return a.get('name')===('repeating_item_'+rowID+'_qty')}) : undefined;
        if(ammoAttr){
            changeMax ? setResource(ammoAttr,true,changeMax) : undefined;
            insufficient = changeCurrent ? setResource(ammoAttr,false,changeCurrent) : 0;
            msgResourceState(character,(getAttrByName(character.id,'is_npc')==='0' ? false : true),rowID,0,((0-insufficient)||0),ammoAttr);
        }
        }catch(err){
            sendError(err);
        }
    },
    
    handleSpellCommand = function(spell,character,spellClass,changeCurrent){
        try{
        var attributes = findObjs({type:'attribute',characterid:character.id}),
            manualTotal = getAttrByName(character.id,'total_spells_manually')==='0' ? false : true,
            isNPC = getAttrByName(character.id,'is_npc')==='0' ? false : true,
            workerWait,attrToID,spellNameAttr,rowID,spellUsedAttr,insufficient,spontaneous,spellMax,spellLevel,spellMaxValue,actualName;
            
        spellNameAttr = _.find(attributes,(a)=>{
            if(a.get('name').match(/repeating_spells_-[^_]+_name/)){
                actualName = a.get('current').match(/\[([^\]]+)\]\([^\)]+\)/) ? a.get('current').match(/\[([^\]]+)\]\([^\)]+\)/)[1] : a.get('current');
                return  actualName===spell;
                }
        });
        rowID = spellNameAttr ? extractRowID(spellNameAttr.get('name')) : undefined;
        if(!rowID){
            return;
        }
        if(spellClass){
            spellClass = _.find(attributes,(a)=>{return a.get('name').match(/spellclass-[012]-name/) && a.get('current')===spellClass});
            spellClass = spellClass ? spellClass.match(/(?:spellclass-([012])-name)/)[1] : undefined;
        }else{
            spellClass = getAttrByName(character.id,'repeating_spells_'+rowID+'_spellclass_number');
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
                        +'{{qty_max=-}}')
                        +'{{spelltracking1=[**_**](!pfc --resource,spell='+spell+',current=-1|'+character.get('name')+')[**&**](!pfc --resource,spell='+spell+',current=+1|'+character.get('name')+')[**?**](!pfc --resource,spell='+spell+',current=?'+HE('{')+spell+' Adjustment}|'+character.get('name')+'})[**1**](!pfc --resource,spell='+spell+',current=0|'+character.get('name')+')}}'
                        +'{{spelldescription1='+spell+'}}');
                    }).catch((err)=>{sendError(err)});
                    //msgResourceState(character,(),rowID,0,((0-insufficient)||0),spellUsedAttr);
                }
            }).catch((err)=>{sendError(err)});
        }
        }catch(err){
            sendError(err);
        }
    },
    
    handleAbilityCommand = function(ability,character,abilityClass,changeCurrent,changeMax){
        try{
        var attributes=findObjs({type:'attribute',characterid:character.id}),
            abilityNameAttr,rowID,abilityAttr,insufficient,actualName;
        
        abilityNameAttr = _.find(attributes,(a)=>{
            if(a.get('name').match(/repeating_ability_[^_]+_name/)){ 
                actualName = a.get('current').match(/\[([^\]]+)\]\([^\)]+\)/) ? a.get('current').match(/\[([^\]]+)\]\([^\)]+\)/)[1] : a.get('current');
                return  actualName===ability;
            }
        });
        rowID = abilityNameAttr ? extractRowID(abilityNameAttr.get('name')) : undefined;
        abilityAttr = rowID ? _.find(attributes,(a)=>{return a.get('name')===('repeating_ability_'+rowID+'_used')}) : undefined;
        if(abilityAttr){
            changeMax ? setResource(abilityAttr,true,changeMax) : undefined;
            insufficient = changeCurrent ? setResource(abilityAttr,false,changeCurrent) : 0;
            insufficient.then((i)=>{
                msgResourceState(character,(getAttrByName(character.id,'is_npc')==='0' ? false : true),rowID,0,((0-i)||0),abilityAttr);
            });
        }
        }catch(err){
            sendError(err);
        }
    },
    
    handleNoteCommand = async function(note,character,changeCurrent){
        try{
        var attributes = findObjs({type:'attribute',characterid:character.id}),
            isNPC = getAttrByName(character.id,'is_npc')==='0' ? false : true,
            noteNameAttr,rowID,noteAttr,insufficient,money,altMax,spellClass,actualName;
            
        if(!note.match(/[GSCP]P|spell\s*points/i)){
            noteNameAttr = _.find(attributes,(a)=>{
                if(a.get('name').match(/custom[ac]\d+-name/)){
                    actualName = a.get('current').match(/\[([^\]]+)\]\([^\)]+\)/) ? a.get('current').match(/\[([^\]]+)\]\([^\)]+\)/)[1] : a.get('current');
                    return  actualName===ammo;
                }
            });
            rowID = noteNameAttr ? noteNameAttr.get('name').match(/(?:custom([abc]\d+)-name)/) : undefined;
            rowID = rowID ? (!rowID[1].match(/10|11|12/) ? rowID[1] : undefined) : undefined;
            noteAttr = rowID ? _.find(attributes,(a)=>{return a.get('name')==='custom'+rowID+'-mod'}) : undefined;
            if(!noteAttr){
                return;
            }
        }else if(note.match(/[GSCP]P/)){
            money=true;
            noteAttr = _.find(attributes,(a)=>{return a.get('name').match(note.replace(/other\s+/i,'other-'))});
        }else if(note.match(/spell\s*points/i)){
            noteNameAttr = _.find(attributes,(a)=>{return a.get('name').match(/spellclass-[0-2]-name/) && a.get('current')===note.replace(/\s+Spell\s*Points/i,'')});
            noteAttr = noteNameAttr ? _.find(attributes,(a)=>{return a.get('name')===noteNameAttr.get('name').replace('name','spell-points-per-day')}) : undefined;
            if(!noteAttr){
                return;
            }
            if((''+changeCurrent).match(/max/i)){
                spellClass = noteNameAttr.get('name').match(/spellclass-([0-2])-name/)[1];
                altMax = parseInt(getAttrByName(character.id,'spellclass-'+spellClass+'-spell-points-class'))+parseInt(getAttrByName(character.id,'spellclass-'+spellClass+'-spell-points-bonus'))+parseInt(getAttrByName(character.id,'spellclass-'+spellClass+'-spell-points-misc'));
            }
        }
        if(!noteAttr){
            return;
        }
        insufficient = changeCurrent ? await setResource(noteAttr,false,changeCurrent,null,altMax) : 0;
        insufficient = insufficient*-1;
        sendChat('Resource Tracking','@{'+character.get('name')+'|'+(!isNPC ? 'PC-whisper':'NPC-whisper')+'} &{template:pf_block} @{'+character.get('name')+'|toggle_accessible_flag} @{'+character.get('name')+'|toggle_rounded_flag} {{color=@{'+character.get('name')+'|rolltemplate_color}}} '
        +'{{subtitle='+(insufficient>0 ? ('``<b>INSUFFICIENT '+note+'</b>``<br>'+insufficient+' short') : '')+'}} {{name=Remaining '+note+'}} {{hasuses=1}} {{qty='+noteAttr.get('current')+'}} {{qty_max='+(altMax ? altMax : ((parseInt(noteAttr.get('max'))>0 && noteAttr.get('max')!=='') ? noteAttr.get('max') : '-'))+'}}'
        +'{{misctracking1=[**_**](!pfc --resource,misc='+note+',current=-1|'+character.id+')[**&**](!pfc --resource,misc='+note+',current=+1|'+character.id+')[**?**](!pfc --resource,misc='+note+',current=?'+HE('{'+note+' Adjustment}')+'|'+character.id+')'+(money ? '' : '[**1**](!pfc --resource,misc='+note+',current=max|'+character.id+')')+'}}'
        +'{{miscdescription1='+note+'}}');
        }catch(err){
            sendError(err);
        }
    },
    
    msgResourceState = function(character,isNPC,resourceId,resourceUsed,insufficient,resourceAttr){
        try{
        var attrToID = resourceAttr.get('name').match(/(?:(repeating_.+_-[^_]+)_.+)/),
            resourceName,resourceTracking;
        attrToID = attrToID ? attrToID[1] : undefined;
        if(!attrToID){
            return;
        }
        resourceName = getAttrByName(character.id,attrToID+'_name');
        resourceTracking = getAttrByName(character.id,attrToID+'_macro-text');
        resourceTracking = !_.isEmpty(resourceTracking) ? resourceTracking.match(/{{(?:ability|misc|spell|item)tracking\d=\[[^\]]+\]\(!pfc --resource,(?:ability|misc|spell|item)=[^,]+,current=[^\|]+\|.*?(?=}})}}/g) : undefined;
        !_.isEmpty(resourceTracking) ? _.some(_.range(resourceTracking.length),(r)=>{
            if(resourceTracking[r].match(/(?:ability|misc|spell|item)=([^,]+)/)[1]===resourceName){
                resourceTracking=resourceTracking[r];
                return true;
            }
        }) : undefined;
        sendChat('Resource Tracking','@{'+character.get('name')+'|'+(!isNPC ? 'PC-whisper':'NPC-whisper')+'} &{template:pf_block} @{'+character.get('name')+'|toggle_accessible_flag} @{'+character.get('name')+'|toggle_rounded_flag} {{color=@{'+character.get('name')+'|rolltemplate_color}}} '
            +'{{subtitle='+(insufficient>0 ? ('``<b>INSUFFICIENT @{'+character.get('name')+'|'+attrToID+'_name}</b>``<br>'+(resourceUsed-insufficient)+' available') : '')+'}} {{name=Remaining @{'+character.get('name')+'|'+attrToID+'_name}}} {{hasuses=1}} {{qty='+resourceAttr.get('current')+'}} {{qty_max='+((parseInt(resourceAttr.get('max'))>0 && resourceAttr.get('max')!=='') ? resourceAttr.get('max') : '-')+'}}'
            +(!attrToID.match(/spell/) ? ('{{shortdesc=@{'+character.get('name')+'|'+attrToID+'_short-description}}}') : '')+' {{description=@{'+character.get('name')+'|'+attrToID+'_description}}}'+(resourceTracking || ''));
        }catch(err){
            sendError(err);
        }
    },
    
    //                  Roll20Attr  Bool string
    setResource = function(attribute,max,change,withWorker,altMax){
        try{
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
        }catch(err){
            sendError(err);
        }
    },
    
    setWhisperState = function(character,pcWhisper,npcWhisper,statsWhisper){
        try{
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
        }catch(err){
            sendError(err);
        }
    },
    
    handleAmmo = function(ammo,mainAmmo,offAmmo,attributes,character,msg,rollId){
        try{
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
            attackNames = msg.content.match(/attack\d?name*=([^}]+)\d+}}/g);
            _.each(attackNames,(n)=>{
                mainUsed += mainName ? (n.match(/attack\dname*=(.*?(?=\-\d+}}|\d+}}))\-?\d+}}/)[1].trim()===mainName.trim() ? 1 : 0) : 0;
                mainUsed += mainName ? (n.match(/manyshot/i) ? 2 : 0) : 0;
                offUsed += n.match(/attack\dname*=(.*?(?=\-\d+}}|\d+}}))\-?\d+}}/)[1].trim()===offName.trim() ? 1 : 0;
            });
            if((!mainCount && !offCount)){
                return;
            }
            mainInsuf = (mainUsed && mainCount) ? mainUsed-mainCount.get('current') : undefined;
            offInsuf = (offUsed && offCount) ? offUsed-offCount.get('current') : undefined;
            (mainUsed && mainCount) ? setResource(mainCount,false,'-'+mainUsed) : undefined;
            (offUsed && offCount) ? setResource(offCount,false,'-'+offUsed) : undefined;
            (mainUsed && mainCount) ? msgResourceState(character,isNPC,mainAmmoId,mainUsed,mainInsuf,mainCount) : undefined;
            (offUsed && offCount) ? msgResourceState(character,isNPC,offAmmoId,offUsed,offInsuf,offCount) : undefined;
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
        }else{
            sendChat('Pathfinder Companion','/w "'+HE(character.get('name'))+'" The Ammo you entered does not exist. You entered: '+(ammo ? ammo : (mainAmmo ? mainAmmo+(offAmmo ? ' & ' : '') : '')+(offAmmo ? offAmmo : ''))+'. Ammo name must exactly match the name of the item in your equipment tab (case sensitive).',null,{noarchive:true});
        }
        }catch(err){
            sendError(err);
        }
    },
    
    handleHP = function(obj,prev){
        try{
        var character = getObj('character',obj.get('characterid')),
            attributes = findObjs({type:'attribute',characterid:obj.get('characterid')}),
            graphic = findObjs({type:'graphic',represents:obj.get('characterid')})[0],
            hpDifference,
            tempHP,hpForTemp,hpForHP,objCurr,objMax;
            
        switch(obj.get('name').toLowerCase()){
            case 'hp':
                objCurr = (''+obj.get('current')).match(/^(?:\+|\-)?\d+$/) ? parseInt(obj.get('current')) : ((''+obj.get('current')).match(/(?:\+|\-)?\d+/) ? parseInt((''+obj.get('current')).match(/(?:\+|\-)?\d+/)[0]) : undefined);
                objMax = (''+obj.get('max')).match(/^(?:\+|\-)?\d+$/) ? parseInt(obj.get('max')) : ((''+obj.get('max')).match(/(?:\+|\-)?\d+/) ? parseInt((''+obj.get('max')).match(/(?:\+|\-)?\d+/)[0]) : undefined);
                if(!objCurr && !objMax){
                    return;
                }
                hpDifference = parseInt(prev.current) - objCurr;
                if(hpDifference<=0){
                    if(objCurr>objMax){
                        obj.set({current:objMax});
                    }
                }else{
                    tempHP = _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='hp-temp'});
                    if(tempHP){
                        hpForTemp = parseInt(tempHP.get('current'))>0 ? Math.min(hpDifference,parseInt(tempHP.get('current'))) : 0;
                        _.defer((tHP,hft,o,ocurr)=>{
                            tHP.set('current',parseInt(tHP.get('current'))-hft);
                            o.set({current:ocurr+hft});
                        },tempHP,hpForTemp,obj,objCurr);
                    }
                }
                break;  
        }
        }catch(err){
            sendError(err);
        }
    },
    
    createConditions = function(attributes){
        var conditions = ['Fatigued','Blinded','Entangled','Invisible','Cowering','Fear','Pinned','Dazzled','Flat-Footed','Prone','Deafened','Grappled','Sickened','Helpless','Stunned','Drained'];
            
        return _.map(conditions,(c)=>{
            return _.filter(attributes,(a)=>{return a.get('name')==='condition-'+c})[0] || createObj('attribute',{characterid:attributes[0].get('characterid'),name:'condition-'+c,current:'0'});
        });
    },
    
    statusControl = function(character,who){
        var msg = '/w "'+who+'" <div style="border: 1px solid black; background-color: white; padding: 3px 3px;">'//overall div for nice formatting of control panel
            +'<div style="font-weight: bold; border-bottom: 1px solid black;font-size: 130%;">'//Control Panel Header div
            +'[Pathfinder]('+mediumLogo+')<br>Companion API Script v'+version
            +'<br><b>Status Menu</b></div>',
            attributes = findObjs({type:'attribute',characterid:character.id}),
            buffs,conditions;
            
        buffs = _.filter(attributes,(a)=>{return a.get('name').match(/buff2_-[^_]+_name/)});
        conditions = createConditions(attributes);
        msg+='<b>Buffs:</b><br>';
        _.each(buffs,(b)=>{
            let toggle = getAttrByName(character.id,b.get('name').replace('name','enable_toggle'));
            msg +=makeButton('!pfc --apply,buff='+b.get('current').replace(/\s*\|\|.*/,'')+',swap|'+character.id+' --statuscontrol',b.get('current').replace(/\s*\|\|.*/,''),(toggle ==='1' ? 'green' : '#C0C0C0'),'black',(toggle ==='1' ? 'Turn Off' : 'Turn On'));
        });
        msg+='<div style="border-top:1px solid black;"><b>Conditions:</b><br>';
        _.each(conditions,(c)=>{
            if(c.get('name').match(/fatigue/i)){
                msg +=makeButton('!pfc --apply,condition='+c.get('name').replace('condition-','')+',swap|'+character.id+' --statuscontrol',c.get('name').replace('condition-',''),(c.get('current')*1 ===1 ? 'green' : '#C0C0C0'),'black',(c.get('current')*1 ===1 ? 'Turn Off' : 'Turn On'));
                msg +=makeButton('!pfc --apply,condition=exhaust,swap|'+character.id+' --statuscontrol','Exhuastion',(c.get('current')*1 ===3 ? 'green' : '#C0C0C0'),'black',(c.get('current')*1 ===3 ? 'Turn Off' : 'Turn On'));
            }else if(c.get('name').match(/drain/i)){
                msg +=makeButton('!pfc --apply,condition='+c.get('name').replace('condition-','')+' ?{Level of Energy Drain}|'+character.id+' --statuscontrol','Energy Drain '+c.get('current')||'0',(c.get('current')*1 ===0 ? '#C0C0C0' : 'green'),'black');
            }else{
                msg +=makeButton('!pfc --apply,condition='+c.get('name').replace('condition-','')+',swap|'+character.id+' --statuscontrol',c.get('name').replace('condition-',''),(c.get('current')*1 ===0 ? '#C0C0C0' : 'green'),'black',(c.get('current')*1 ===0 ? 'Turn On' : 'Turn Off'));
            }
        });
        msg+='</div></div>';
        sendChat('Pathfinder Companion',msg,null,{noarchive:true});
    },
    
    buffSetup = function(character,buff,marker,who){
        var msg = '/w "'+who+'" <div style="border: 1px solid black; background-color: white; padding: 3px 3px;">'//overall div for nice formatting of control panel
            +'<div style="font-weight: bold; border-bottom: 1px solid black;font-size: 130%;">'//Control Panel Header div
            +'[Pathfinder]('+mediumLogo+')<br>Companion API Script v'+version
            +'<b> Buff Status Selector</b></div>',
            currBuffs = _.filter(findObjs({type:'attribute',characterid:character.id}),(a)=>{return a.get('name').match(/repeating_buff2_-[^_]+_name/)}),
            markersUsed = [],
            buffName,buffMarker,buffMatch,command;
        if(_.isEmpty(currBuffs)){
            //need to message that no buffs
            return;
        }
        if(buff){
            buff = _.find(currBuffs,(cb)=>{return cb.get('current').match(buff)});
            if(!buff){
                return;
            }
            if(marker){
                buff.set('current',buff.get('current').replace(/\s+\|\|\s+.*/,'')+' || '+marker);
            }
            _.each(currBuffs,(cb)=>{
                if(cb.get('name')!==buff.get('name') && cb.get('current').match(/\s+\|\|\s+(.*)/)){
                    markersUsed.push(cb.get('current').match(/\s+\|\|\s+(.*)/)[1]);
                }
            });
            _.each(state.PFCompanion.markers,(m)=>{
                markersUsed.push(m);
            });
            buffMatch = buff.get('current').match(/(.*(?=\s+\|\|\s+))\s+\|\|\s+(.*)/);
            if(buffMatch){
                buffName = buffMatch[1];
                buffMarker = marker ? marker : buffMatch[2]; 
            }else{
                buffName = buff.get('current');
                buffMarker = marker ? marker : 'NO BUFF STATUS MARKER PRESENT';
            }
            msg+='Select what marker should denote an active '+buffName+' buff on '+character.get('name')+'<br>'
            _.each(statusquery,(s)=>{
                //                      command                                                                       status condition      used                                    current
                msg+=makeStatusButton('!pfc --buffstatus,buff='+buffName+',markers='+s+'|'+character.id,s,null,_.some(markersUsed,(m)=>{return m===s}),s.match(buffMarker));
            });
            msg+='<div style="clear: both"></div>';
            //statusmarker selector
        }else{
            msg+='Which buff would you like to set the statusmarker for?<br>';
            _.each(currBuffs,(b)=>{
                buffMatch = b.get('current').match(/(.*(?=\s+\|\|\s+))\s+\|\|\s+.*/);
                if(buffMatch){
                    buffName = buffMatch[1];
                    buffMarker = buffMatch[2]; 
                }else{
                    buffName = b.get('current');
                }
                msg+=makeButton('!pfc --buffstatus,buff='+buffName,buffName,'transparent','black','Customize '+buffName);
            });
        }
        msg+='</div>';
        sendChat('Pathfinder Companion',msg,null,{noarchive:true});
    },
    
    applyConditions = async function(character,condition,buff,swap,remove,rounds){
        try{
        var attributes = findObjs({type:'attribute',characterid:(character.get('type')==='character' ? character.id : character.get('represents'))}),
            cid = (character.get('type')==='character' ? character.id : character.get('represents')),
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
            conditionNameArr = ['Fatigued','Blinded','Entangled','Invisible','Cowering','Fear','Pinned','Dazzled','Flat-Footed','Prone','Deafened','Grappled','Sickened','Helpless','Stunned','Energy Drain'],
            conditionAttributes,conditionAttr,conditionName,drainMatch,
            buffAttr,buffNameAttr,buffMatch,buffStatus,
            toSet,graphic,barLinked,
            defaultToken = character.get('type')==='character' ? await new Promise((resolve,reject)=>{
                character.get('_defaulttoken',(t)=>{
                    if(!_.isEmpty(t)){
                        resolve(JSON.parse(t));
                    }else{
                        resolve(undefined);
                    }
                });
            }) : undefined,
            barWork = [1,2,3],
            turnTracker,turnOrder,conditionTrackName,buffTrackName,conditionObject,buffObject,buffIndex,conditionIndex,conditionState,buffState;
            
        if(character.get('type')==='character'){
            barLinked = _.some(barWork,(b)=>{
                return !_.isEmpty(defaultToken['bar'+b+'_link']);
            });
        }
        if(condition){
            conditionName = condition.match(/exhaust|fatigue/i) ? 'fatigue' : (condition.match(/energy|drain/i) ? 'energy drain' : condition);
            drainMatch = condition.match(/(?:energy\s+)?(?:drain\s+)?(\d+|all)/i)
            conditionName = _.find(conditionNameArr,(cn)=>{return cn.match(new RegExp(conditionName,'i'))});
            if(!conditionName){
                //handling for invalid condition name
                return;
            }
            conditionAttributes = _.filter(attributes,(a)=>{return a.get('name').match(/condition-/)});
            conditionAttr = getAttrByName(cid,'condition-'+(conditionName==='Energy Drain' ? 'Drained' : conditionName));
            toSet = condition.match(/exhaust/i) ? '3' : (condition.match(/fatigue/i) ? '1' : (conditionName==='Energy Drain' ? Math.min(parseInt(conditionAttr)+((remove ? 1 : -1)*parseInt((drainMatch ? drainMatch[1] : '1'))),0) : convertValue[conditionName]));
            toSet = drainMatch ? (drainMatch[1].match(/all/i) ? 0 : toSet) : toSet;
            conditionState = (swap ? ''+(parseInt(swapper[conditionAttr])*parseInt(toSet)) : ((remove && conditionName!=='Energy Drain') ? '0' : toSet));
            if(character.get('type')==='character'){
                await createAttrWithWorker('condition-'+(conditionName==='Energy Drain' ? 'Drained' : conditionName),cid,conditionAttributes,conditionState);
            }
            if(state.PFCompanion.defaultToken.enable==='on' && (barLinked || !_.isEmpty(character.get('controlledby')))){
                graphic = findObjs({type:'graphic',represents:cid})[0];
                if(graphic){
                    applyStatus(character,state.PFCompanion.markers[conditionName],parseInt(conditionState)===0 ? false : (condition.match(/exha/i) ? 2 : (conditionName==='Energy Drain' ? (Math.abs(toSet)===0 ? false : Math.min(Math.abs(toSet),9)) : true)));
                }
            }
        }
        if(buff){
            buffNameAttr = buff ? _.find(attributes,(a)=>{return a.get('name').match(/repeating_buff2_-[^_]+_name/) && a.get('current').toLowerCase().match(buff.toLowerCase())}) : undefined;
            buffAttr=getAttrByName(cid,buffNameAttr.get('name').replace('name','enable_toggle'));
            buffState = (swap ? swapper[buffAttr+''] : (remove ? '0' : '1'));
            if(character.get('type')==='character'){
                buffNameAttr ? createAttrWithWorker(buffNameAttr.get('name').replace('name','enable_toggle'),cid,attributes,buffState) : undefined;
            }
            buffMatch = buffNameAttr.get('current').match(/(.*(?=\s+\|\|\s+))\s+\|\|\s+(.*)/);
            if(state.PFCompanion.defaultToken.enable==='on' && (barLinked || !_.isEmpty(character.get('controlledby'))) && buffMatch){
                graphic = findObjs({type:'graphic',represents:cid})[0];
                if(graphic){
                    _.some(statusquery,(sq)=>{return sq.match(buffMatch[2]) ? buffStatus=sq : false}) ? applyStatus(character,buffStatus,parseInt(buffState)===0 ? false : true) : undefined;
                }
            }
        }
        if(character.get('type')==='graphic'){
            if(buff){
                _.some(statusquery,(sq)=>{return sq.match(buffMatch[2]) ? buffStatus=sq : false}) ? applyStatus(character,buffStatus,parseInt(buffState)===0 ? false : true,true) : undefined;
            }
            if(condition){
                applyStatus(character,state.PFCompanion.markers[conditionName],parseInt(conditionState)===0 ? false : (condition.match(/exha/i) ? 2 : (conditionName==='Energy Drain' ? (Math.abs(toSet)===0 ? false : Math.min(Math.abs(toSet),9)) : true)),true);
            }
        }
        if(rounds || remove){
            rounds = rounds || 0;
            turnTracker =Campaign().get('initiativepage');
            if(turnTracker){
                turnOrder = Campaign().get('turnorder');
                turnOrder = !_.isEmpty(turnOrder) ? JSON.parse(turnOrder) : [];
                if(conditionName){
                    conditionTrackName = character.get('name')+' Condition: '+conditionName+(drainMatch ? ' '+drainMatch[1] : '');
                    _.some(_.range(turnOrder.length),(r)=>{
                        if(turnOrder[r].custom===conditionTrackName && turnOrder[r].id==='-1'){
                            conditionIndex = r;
                            return true;
                        }else{return false}
                    });
                    conditionObject = conditionIndex ? _.clone(turnOrder[conditionIndex]) : {'id':'-1','custom':conditionTrackName,'formula':'-1','token':(character.get('type')==='graphic' ? character.id : '')};
                    if(!conditionObject) return;
                    conditionObject.pr=rounds;
                    turnOrder.splice((!isNaN(conditionIndex) ? conditionIndex : 1),(!isNaN(conditionIndex) ? 1 : 0),(parseInt(conditionState)!==0 ? conditionObject : undefined));
                }
                turnOrder = _.reject(turnOrder,(t)=>{return _.isUndefined(t)});
                if(buffNameAttr){
                    buffTrackName = character.get('name')+' Buff: '+(buffMatch ? buffMatch[1] : buffNameAttr.get('current'));
                    _.some(_.range(turnOrder.length),(r)=>{
                        if(turnOrder[r].custom===buffTrackName && turnOrder[r].id==='-1'){
                            buffIndex = r;
                            return true;
                        }else{return false}
                    });
                    buffObject = buffIndex ? _.clone(turnOrder[buffIndex]) : {'id':'-1','custom':buffTrackName,'formula':'-1','token':(character.get('type')==='graphic' ? cid : '')};
                    if(!buffObject) return;
                    buffObject.pr=rounds;
                    turnOrder.splice((!isNaN(buffIndex) ? buffIndex : 1),(!isNaN(buffIndex) ? 1 : 0),(parseInt(buffState)!==0 ? buffObject : undefined));
                }
                turnOrder = _.reject(turnOrder,(t)=>{return _.isUndefined(t)});
                Campaign().set('turnorder',JSON.stringify(turnOrder));
            }
        }
        }catch(err){
            sendError(err);
        }
    },
    
    applyStatus = function(character,status,state,mook){
        var graphic = mook ? character : findObjs({type:'graphic',represents:character.id})[0];
        if(!graphic){return}
        graphic.set('status_'+status,state);
        mook ? undefined : updateAllTokens(character,graphic);
    },
    
    mapBars = function(graphic,character){
        try{
        var bars = {},
            attributes = findObjs({type:'attribute',characterid:character.id}),
            npc = getAttrByName(character.id,'is_npc')==='0' ? false : true,
            bar1Attr,bar2Attr,bar3Attr;
            
        if(state.PFCompanion.defaultToken.bar1Link){
            bar1Attr = _.find(attributes,(a)=>{return a.get('name').toLowerCase() === state.PFCompanion.defaultToken.bar1Link.toLowerCase()});
            if(bar1Attr){
                graphic.set({bar1_link:(npc ? '' : bar1Attr.id),bar1_value:bar1Attr.get('current'),bar1_max:(bar1Attr.get('max')!=='0' ? bar1Attr.get('max') : '')});
            }
        }
        if(state.PFCompanion.defaultToken.bar2Link){
            bar2Attr = _.find(attributes,(a)=>{return a.get('name').toLowerCase() === state.PFCompanion.defaultToken.bar2Link.toLowerCase()});
            if(bar2Attr){
                graphic.set({bar2_link:(npc ? '' : bar2Attr.id),bar2_value:bar2Attr.get('current'),bar2_max:(bar2Attr.get('max')!=='0' ? bar2Attr.get('max') : '')});
            }
        }
        if(state.PFCompanion.defaultToken.bar3Link){
            bar3Attr = _.find(attributes,(a)=>{return a.get('name').toLowerCase() === state.PFCompanion.defaultToken.bar3Link.toLowerCase()});
            if(bar3Attr){
                graphic.set({bar3_link:(npc ? '' : bar3Attr.id),bar3_value:bar3Attr.get('current'),bar3_max:(bar3Attr.get('max')!=='0' ? bar3Attr.get('max') : '')});
            }
        }
        
        graphic.set({showplayers_bar1:(state.PFCompanion.defaultToken.bar1Visible==='on' ? true : false),showplayers_bar2:(state.PFCompanion.defaultToken.bar2Visible==='on' ? true : false),showplayers_bar3:(state.PFCompanion.defaultToken.bar3Visible==='on' ? true : false)});
        if((bar3Attr || bar2Attr || bar1Attr) && !_.isEmpty(character.get('controlledby'))){
            setDefaultTokenForCharacter(character,graphic);
            updateAllTokens(character);
        }
        }catch(err){
            sendError(err);
        }
    },
    
    //problem is how the default token's bar values/maxes are set
    updateAllTokens = async function(character,graphic){
        try{
        var tokens = findObjs({type:'graphic',represents:character.id}),
            tok,barValues,
            defaultToken,
            tokWorker = () =>{
                try{
                    tok = tokens.shift();
                    tok.set(_.defaults({left:tok.get('left'),top:tok.get('top'),tint_color:defaultToken.tint_color ? defaultToken.tint_color : 'transparent'},defaultToken));
                    return _.isEmpty(tokens) ? 'tokens updated' : new Promise((resolve,reject)=>{
                        _.defer(()=>{resolve(tokWorker())});
                    });
                }catch(err){
                    sendError(err);
                }
            };
        if(graphic){
            setDefaultTokenForCharacter(character,graphic);
            tokens=_.reject(tokens,(t)=>{return t.id===graphic.id});
        }
        defaultToken = new Promise ((resolve,reject)=>{
            character.get('_defaulttoken',(t)=>{
                resolve(!_.isEmpty(t) ? JSON.parse(t) : undefined);
            });
        });
        defaultToken = await defaultToken;
        if(defaultToken){
            defaultToken.statusmarkers = defaultToken.statusmarkers || '';
            defaultToken.left='';
            defaultToken.top='';
            defaultToken.imgsrc=cleanImgSrc(defaultToken.imgsrc);
            return !_.isEmpty(tokens) ? tokWorker() : 'All Tokens Worked';
        }else{
            return 'no default token or tokens on board';
        }
        }catch(err){
            sendError(err);
        }
    },
    
    tokenHandler = function(who,token,details){
        try{
        var msg = '/w "'+who+'" <div style="border: 1px solid black; background-color: white; padding: 3px 3px;">'//overall div for nice formatting of control panel
            +'<div style="font-weight: bold; border-bottom: 1px solid black;font-size: 130%;">'//Control Panel Header div
            +'[Pathfinder]('+mediumLogo+')<br>Companion API Script v'+version
            +'<b> Token Setup Wizard</b></div>',
            detailKeys = _.keys(details),
            linkQuery = '?{Name of attribute to link to, case insensitive. Repeating Sections not valid}',
            links = {
                'bar1':getObj('attribute',token.get('bar1_link')),
                'bar2':getObj('attribute',token.get('bar2_link')),
                'bar3':getObj('attribute',token.get('bar3_link'))
            },
            updated = true,
            character=getObj('character',token.get('represents')),
            charID,attribute,barvalue,barmax;
            
        if(!_.isEmpty(detailKeys)){
            _.each(detailKeys,(dk)=>{
                if(dk==='represents'){
                    updated = false;
                    character = details[dk].match(/^\s*$/) ? '' : findObjs({name:details[dk]})[0];
                    if(character || character===''){
                        charID = _.isEmpty(character) ? '' : character.id;
                        token.set('represents',charID);
                        if(charID){
                            mapBars(token,character);
                        }
                    }
                }else if(dk.match(/showplayers_(?:bar|aura)[1-3]|playersedit_(?:bar|aura)[1-3]|aura[12]_square|light_(?:hassight|otherplayers)/)){
                    token.set(dk,(details[dk]==='on' ? true : false));
                }else if(dk.match(/bar[1-3]_value/)){
                    attribute = details[dk].match(/^\s*$/) ? '' : _.find(findObjs({type:'attribute',characterid:character.id}),(a)=>{return a.get('name').match(new RegExp('^'+details[dk]+'$','i'))});
                    if(attribute || attribute===''){
                        barmax = dk.replace('value','max');
                        if(attribute!==''){
                            token.set(dk,attribute.get('current'));
                            token.set(barmax,attribute.get('max'));
                        }else{
                            token.set(dk,'');
                            token.set(barmax,'');
                        }
                    }else{
                        updated=false;
                    }
                }else if(dk.match(/bar[1-3]_link/)){
                    attribute = details[dk].match(/^\s*$/) ? '' : _.find(findObjs({type:'attribute',characterid:character.id}),(a)=>{return a.get('name').match(new RegExp('^'+details[dk]+'$','i'))});
                    if(attribute || attribute===''){
                        barvalue = dk.replace('link','value');
                        barmax = dk.replace('link','max');
                        if(attribute !== ''){
                            token.set(dk,attribute.id);
                            token.set(barvalue,attribute.get('current'))
                            token.set(barmax,attribute.get('max'));
                        }else{
                            token.set(dk,'')
                            token.set(barvalue,'')
                            token.set(barmax,'');
                        }
                    }else{
                        updated=false;
                    }
                }else if(dk.match(/width|height|aura[12]_(?:color|radius)|tint_color|light_((?:dim)?radius|angle|losangle|multiplier)/)){
                    token.set(dk,details[dk]);
                }
            });
            if(updated && character){
                updateAllTokens(character,token);
            }
        }else{
            msg+='<b>Represents</b><div style="float:right">'+ makeButton('!pfc --token,represents=?{Name of Character} --token',(_.isEmpty(token.get('represents')) ? 'NONE' : getObj('character',token.get('represents')).get('name')),'transparent','black','Set what character this token represents') +'</div><div style="clear: both"></div>'
            +(!_.isEmpty(token.get('represents')) ? 
            '<div style="textalign:center;font-size:110%;font-weight:bold;">Dimensions</div>'
            +'<div style="font-size:90%;">(In Squares)</div>'
            +'<b>Width</b><div style="float:right;">'+makeButton('!pfc --token,width=?{Unit Width} --token',token.get('width'),'transparent','black','Set the width of the token in units (# of squares)')+'</div><div style="clear:both;">'
            +'<b>Height</b><div style="float:right;">'+makeButton('!pfc --token,height=?{Unit Height} --token',token.get('height'),'transparent','black','Set the height of the token in units (# of squares)')+'</div><div style="clear:both;">'
            //Bar Settings
            +'<br><div style="textalign:center;font-size:110%;font-weight:bold;">Bars</div>'
            +'<table style="width:100%;table-layout:fixed;overflow:hidden;word-wrap:break-all;text-align:center;">'
                +'<colgroup>'
                    +'<col span="4" style="width:25%;word-wrap:break-word;">'
                +'</colgroup>'
                +'<tr>'
                    +'<th> </th>'
                    +'<th>Bar 3</th>'
                    +'<th>Bar 1</th>'
                    +'<th>Bar 2</th>'
                +'</tr><tr>'
                    +'<td><b>Link</b></td>'
                    +'<td>'+makeButton('!pfc --token,bar3_link='+linkQuery+' --token',links.bar3 ? links.bar3.get('name') : '_','transparent',links.bar3 ? 'black' : 'transparent','Set what attribute to link bar 3 to')+'</td>'
                    +'<td>'+makeButton('!pfc --token,bar1_link='+linkQuery+' --token',links.bar1 ? links.bar1.get('name') : '_','transparent',links.bar1 ? 'black' : 'transparent','Set what attribute to link bar 1 to')+'</td>'
                    +'<td>'+makeButton('!pfc --token,bar2_link='+linkQuery+' --token',links.bar2 ? links.bar2.get('name') : '_','transparent',links.bar2 ? 'black' : 'transparent','Set what attribute to link bar 2 to')+'</td>'
                +'</tr><tr>'
                    +'<td><b>Value</b></td>'
                    +'<td>'+makeButton('!pfc --token,bar3_value=?{Pull Values From} --token',(token.get('bar3_value')+'/'+token.get('bar3_max')),'transparent','black','If bar 3 is not linked directly, what attribute should it pull its default values from')+'</td>'
                    +'<td>'+makeButton('!pfc --token,bar1_value=?{Pull Values From} --token',(token.get('bar1_value')+'/'+token.get('bar1_max')),'transparent','black','If bar 1 is not linked directly, what attribute should it pull its default values from')+'</td>'
                    +'<td>'+makeButton('!pfc --token,bar2_value=?{Pull Values From} --token',(token.get('bar2_value')+'/'+token.get('bar2_max')),'transparent','black','If bar 2 is not linked directly, what attribute should it pull its default values from')+'</td>'
                +'</tr><tr>'
                    +'<td><b>Visible</b></td>'
                    +'<td><div style="font-family:pictos;">'+makeButton('!pfc --token,showplayers_bar3='+(token.get('showplayers_bar3') ? 'off' : 'on')+' --token',(token.get('showplayers_bar3') ? '3' : '_'),'transparent','black','Toggle Visibility on/off')+'</div></td>'
                    +'<td><div style="font-family:pictos;">'+makeButton('!pfc --token,showplayers_bar1='+(token.get('showplayers_bar1') ? 'off' : 'on')+' --token',(token.get('showplayers_bar1') ? '3' : '_'),'transparent','black','Toggle Visibility on/off')+'</div></td>'
                    +'<td><div style="font-family:pictos;">'+makeButton('!pfc --token,showplayers_bar2='+(token.get('showplayers_bar2') ? 'off' : 'on')+' --token',(token.get('showplayers_bar2') ? '3' : '_'),'transparent','black','Toggle Visibility on/off')+'</div></td>'
                +'</tr><tr>'
                    +'<td><b>Edit</b></td>'
                    +'<td><div style="font-family:pictos;">'+makeButton('!pfc --token,playersedit_bar3='+(token.get('playersedit_bar3') ? 'off' : 'on')+' --token',(token.get('playersedit_bar3') ? '3' : '_'),'transparent','black','Toggle Player ability to edit on/off')+'</div></td>'
                    +'<td><div style="font-family:pictos;">'+makeButton('!pfc --token,playersedit_bar1='+(token.get('playersedit_bar1') ? 'off' : 'on')+' --token',(token.get('playersedit_bar1') ? '3' : '_'),'transparent','black','Toggle Player ability to edit on/off')+'</div></td>'
                    +'<td><div style="font-family:pictos;">'+makeButton('!pfc --token,playersedit_bar2='+(token.get('playersedit_bar2') ? 'off' : 'on')+' --token',(token.get('playersedit_bar2') ? '3' : '_'),'transparent','black','Toggle Player ability to edit on/off')+'</div></td>'
                +'</tr>'
            +'</table>'
            //Aura Settings
            +'<br><div style="textalign:center;font-size:110%;font-weight:bold;">Auras</div>'
            +'<table style="width:100%;table-layout:fixed;overflow:hidden;word-wrap:break-all;text-align:center;">'
                +'<colgroup>'
                    +'<col span="3" style="width:25%;word-wrap:break-word;">'
                +'</colgroup>'
                +'<tr>'
                    +'<th> </th>'
                    +'<th>Aura 1</th>'
                    +'<th>Aura 2</th>'
                +'</tr><tr>'
                    +'<td><b>Radius</b></td>'
                    +'<td>'+makeButton('!pfc --token,aura1_radius=?{Aura Radius, in page units} --token',!_.isEmpty(token.get('aura1_radius')) ? token.get('aura1_radius') : '_','transparent',!_.isEmpty(token.get('aura1_radius')) ? 'black':'transparent','Set the radius of the aura in units(squares)')+'</td>'
                    +'<td>'+makeButton('!pfc --token,aura2_radius=?{Aura Radius, in page units} --token',!_.isEmpty(token.get('aura2_radius')) ? token.get('aura2_radius') : '_','transparent',!_.isEmpty(token.get('aura2_radius')) ? 'black':'transparent','Set the radius of the aura in units(squares)')+'</td>'
                +'</tr><tr>'
                    +'<td><b>Color</b></td>'
                    +'<td>'+makeButton('!pfc --token,aura1_color=?{Hex Color} --token',token.get('aura1_color'),token.get('aura1_color'),token.get('aura1_color'),'Set the color of the aura in hex')+'</td>'
                    +'<td>'+makeButton('!pfc --token,aura2_color=?{Hex Color} --token',token.get('aura2_color'),token.get('aura2_color'),token.get('aura2_color'),'Set the color of the aura in hex')+'</td>'
                +'</tr><tr>'
                    +'<td><b>Square</b></td>'
                    +'<td><div style="font-family:pictos;">'+makeButton('!pfc --token,aura1_square='+(token.get('aura1_square') ? 'off' : 'on')+' --token',(token.get('aura1_square') ? '3' : '_'),'transparent','black','Toggle between square and circular aura')+'</div></td>'
                    +'<td><div style="font-family:pictos;">'+makeButton('!pfc --token,aura2_square='+(token.get('aura2_square') ? 'off' : 'on')+' --token',(token.get('aura2_square') ? '3' : '_'),'transparent','black','Toggle between square and circular aura')+'</div></td>'
                +'</tr><tr>'
                    +'<td><b>Visible</b></td>'
                    +'<td><div style="font-family:pictos;">'+makeButton('!pfc --token,showplayers_aura1='+(token.get('showplayers_aura1') ? 'off' : 'on')+' --token',(token.get('showplayers_aura1') ? '3' : '_'),'transparent','black','Toggle aura visibility on/off')+'</div></td>'
                    +'<td><div style="font-family:pictos;">'+makeButton('!pfc --token,showplayers_aura2='+(token.get('showplayers_aura2') ? 'off' : 'on')+' --token',(token.get('showplayers_aura2') ? '3' : '_'),'transparent','black','Toggle aura visibility on/off')+'</div></td>'
                +'</tr><tr>'
                    +'<td><b>Edit</b></td>'
                    +'<td><div style="font-family:pictos;">'+makeButton('!pfc --token,playersedit_aura1='+(token.get('playersedit_aura1') ? 'off' : 'on')+' --token',(token.get('playersedit_aura1') ? '3' : '_'),'transparent','black','Toggle player ability to edit this aura on/off')+'</div></td>'
                    +'<td><div style="font-family:pictos;">'+makeButton('!pfc --token,playersedit_aura2='+(token.get('playersedit_aura2') ? 'off' : 'on')+' --token',(token.get('playersedit_aura2') ? '3' : '_'),'transparent','black','Toggle player ability to edit this aura on/off')+'</div></td>'
                +'</tr>'
            +'</table>'
            //Tint Color
            +'<br><b>Tint Color</b><div style="float:right;">'+makeButton('!pfc --token,tint_color=?{Hex Color} --token',token.get('tint_color'),token.get('tint_color'),token.get('tint_color'),'Set the token tint in hex')+'</div><div style="clear:both;"></div>'
            //Light Settings
            +'<br><div style="textalign:center;font-size:110%;font-weight:bold;">Lighting</div>'
            +'<br><b>Radius</b><div style="float:right;">'+makeButton('!pfc --token,light_radius=?{Bright Radius, in page units} --token',!_.isEmpty(token.get('light_radius')) ? token.get('light_radius') : '_','transparent',!_.isEmpty(token.get('light_radius')) ? 'black':'transparent','Total light radius in units(squares)')+'</div><div style="clear:both;">'
            +'<b>Dim Radius</b><div style="float:right;">'+makeButton('!pfc --token,light_dimradius=?{Dim Radius, in page units} --token',!_.isEmpty(token.get('light_dimradius')) ? token.get('light_dimradius') : '_','transparent',!_.isEmpty(token.get('light_dimradius')) ? 'black':'transparent','Start of Dim light radius in units(squares)')+'</div><div style="clear:both;">'
            +'<b>Light Angle</b><div style="float:right;">'+makeButton('!pfc --token,light_angle=?{Degrees to light} --token',!_.isEmpty(token.get('light_angle')) ? token.get('light_angle') : '360','transparent','black','0-360 degrees or blank for default(360)')+'</div><div style="clear:both;">'
            +'<b>Sight</b><div style="float:right;font-family:pictos;">'+makeButton('!pfc --token,light_hassight='+(token.get('light_hassight') ? 'off' : 'on')+' --token',(token.get('light_hassight') ? '3' : '_'),'transparent','black','Toggle sight on/off')+'</div><div style="clear:both;">'
            +'<b>Visible</b><div style="float:right;font-family:pictos;">'+makeButton('!pfc --token,light_otherplayers='+(token.get('light_otherplayers') ? 'off' : 'on')+' --token',(token.get('light_otherplayers') ? '3' : '_'),'transparent','black','Can others see the light emitted by this token')+'</div><div style="clear:both;">'
            +'<b>Vision Angle</b><div style="float:right;">'+makeButton('!pfc --token,light_losangle=?{Can see what degrees} --token',!_.isEmpty(token.get('light_losangle')) ? token.get('light_losangle') : '360','transparent','black','0-360 or blank for default(360)')+'</div><div style="clear:both;">'
            +'<b>Multiplier</b><div style="float:right;">'+makeButton('!pfc --token,light_multiplier=?{Multiply Light by} --token',!_.isEmpty(token.get('light_multiplier')) ? token.get('aura1_radius') : '1','transparent','black','Multiply all light by X')+'</div><div style="clear:both;">'
            : '');
            msg+='</div>';
            sendChat('Pathfinder Companion',msg,null,{noarchive:true});
        }
        }catch(err){
            sendError(err);
        }
    },
    
    sendGroupRoll = function(characters,roll,whisper,sort){
        try{
        var rollName,
            rollMsg = '&{template:pf_generic} {{name=',
            notes = '',
            attrOp = {
                'fort':'Fort','ref':'Ref','will':'Will','acrobatics':'Acrobatics','appraise':'Appraise','bluff':'Bluff','climb':'Climb','craft':'Craft',
                'diplomacy':'Diplomacy','disable device':'Disable-Device','disguise':'Disguise','escape artist':'Escape-Artist','fly':'Fly',
                'handle animal':'Handle-Animal','heal':'Heal','intimidate':'Intimidate','arcana':'Knowledge-Arcana','dungeoneering':'Knowledge-Dungeoneering',
                'engineering':'Knowledge-Engineering','geography':'Knowledge-Geography','history':'Knowledge-History','local':'Knowledge-Local',
                'nature':'Knowledge-Nature','nobility':'Knowledge-Nobility','planes':'Knowledge-Planes','religion':'Knowledge-Religion',
                'linguistics':'Linguistics','perception':'Perception','perform':'Perform','profession':'Profession','ride':'Ride','sense motive':'Sense-Motive',
                'sleight of hand':'Sleight-of-Hand','stealth':'Stealth','survival':'Survival','swim':'Swim','use magic device':'Use-Magic-Device',
                'misc':'Misc-Skill-0','initiative':'init'
            },
            nameOp = {
                'fort':'Fortitude Save','ref':'Reflex Save','will':'Will Save','acrobatics':'Acrobatics','appraise':'Appraise','bluff':'Bluff','climb':'Climb','craft':'Craft',
                'diplomacy':'Diplomacy','disable device':'Disable Device','disguise':'Disguise','escape artist':'Escape Artist','fly':'Fly',
                'handle animal':'Handle Animal','heal':'Heal','intimidate':'Intimidate','arcana':'Knowledge (Arcana)','dungeoneering':'Knowledge (dungeoneering)',
                'engineering':'Knowledge (Engineering)','geography':'Knowledge (Geography)','history':'Knowledge (History)','local':'Knowledge (Local)',
                'nature':'Knowledge (Nobility)','nobility':'Knowledge (Nobility)','planes':'Knowledge (Planes)','religion':'Knowledge (Religion)',
                'linguistics':'Linguistics','perception':'Perception','perform':'Perform','profession':'Profession','ride':'Ride','sense motive':'Sense Motive',
                'sleight of hand':'Sleight of Hand','stealth':'Stealth','survival':'Survival','swim':'Swim','use magic device':'Use Magic Device',
                'misc':'Misc-Skill-0','initiative':'Initiative'
            },
            mArray=[],
            turnTracker,roll,note;
            
        rollName = roll.toLowerCase().match(/fort|ref|will|acrobatics|appraise|bluff|climb|craft|diplomacy|disable device|disguise|escape artist|fly|handle animal|heal|intimidate|arcana|dungeoneering|engineering|geography|history|local|nobility|planes|religion|linguistics|perception|perform|profession|ride|sense motive|sleight of hand|stealth|survival|swim|use magic device|misc|initiative/);
        rollName = rollName ? rollName[0] : undefined;
        if(!rollName){
            //handling for unsupported roll
            return;
        }
        if(rollName === 'initiative'){
            turnTracker = Campaign().get('turnorder');
            Campaign().set('initiativepage',characters[0].get('pageid'));
            turnTracker = !_.isEmpty(turnTracker) ? JSON.parse(turnTracker) : [];
        }
        rollMsg += nameOp[rollName]+'}}';
        characters = characters ? characters : _.filter(findObjs({type:'character'}),(c)=>{return !_.isEmpty(c.get('controlledby'))});
        _.each(characters,(c)=>{
            if(rollName==='initiative'){
                let mod = getAttrByName(c.get('represents'),'init')*1;
                roll = randomInteger(20);
                let existing = null;
                _.some(_.range(turnTracker.length),(r)=>{
                    if(turnTracker[r].id===c.id){
                        existing = r;
                        return true;
                    }else{
                        return false;
                    }
                });
                if(existing!==null){
                    turnTracker[existing].pr=(roll+mod+(mod/100));
                }else{
                    turnTracker.push({pr:(roll+mod+(mod/100)),id:c.id,custom:'',formula:''});
                }
                mArray.push({result:(roll+mod),msg:'{{['+c.get('name')+'](https://journal.roll20.net/character/'+c.get('represents')+')=[['+roll+' + '+mod+'+'+mod/100+((roll===20||roll===1) ? '+1d0'+(roll===1 ? 'cf>0cs>1' : 'cs>0') : '')+']] }}',note:getAttrByName(c.get('represents') || c.id,(rollName.match(/fort|ref|will/i) ? 'Save-notes' : attrOp[rollName]+'-note'))});
            }else{
                rollMsg += '{{['+c.get('name')+'](https://journal.roll20.net/character/'+c.id+')=[[1d20 + @{'+c.get('name')+'|'+attrOp[rollName]+'}]] }}';
                note = getAttrByName(c.get('represents') || c.id,(rollName.match(/fort|ref|will/i) ? 'Save-notes' : attrOp[rollName]+'-note'));
                notes+= !_.isEmpty(note) ? ((_.isEmpty(notes) ? '{{' : '<br>')+c.get('name')+': **'+note+'**') : '';
            }
        });
        if(!_.isEmpty(mArray)){
            mArray = sort ? _.sortBy(mArray,(m)=>{return m.result*-1}) : mArray;
            _.each(mArray,(m)=>{
                rollMsg+=m.msg;
                notes+= !_.isEmpty(m.note) ? ((_.isEmpty(notes) ? '{{' : '<br>')+c.get('name')+': **'+m.note+'**') : '';
            });
        }
        rollMsg+=notes+(_.isEmpty(notes) ? '':'}}');
        if(turnTracker){
            if(sort){
                turnTracker = _.sortBy(turnTracker,(t)=>{return -1*t.pr});
            }
            Campaign().set('turnorder',JSON.stringify(turnTracker));
        }
        sendChat('PF Group Roll',(whisper ? '/w gm ' : '')+rollMsg);
        }catch(err){
            sendError(err);
        }
    },
    
    statblockHandler = async function(text,characters,who){
        try{
        var block,iChar,blockSection,attributes,accrue,attributesToSet,description,setAttr,attrWorker,section,keys,parser,parseSection,statBlock,keyWorker,usesSpells,charListLength,tokenImage,token,page,
            spellsToCreate=[],
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
            defenseMatch=/DEFENSE\n+(AC\s+[^\n]+)\n+hp\s+([^\n]+)\n+Fort\s+([^,;]+)(?:,|;)\s+Ref\s+([^,;]+)(?:,|;)\s+Will\s+([^\n]+)\n+(?:Defensive\s+Abilities\s+([^;\n]+))?(?:;|\n+|\s+)?(?:DR\s+([^;\n]+);)?(?:\s+)?(?:Immune\s([^;\n]+)(?:;)?)?(?:\s+)?(?:Resist\s+([^;\n]+);)?(?:\s+)?(?:SR\s+(\d+))?(?:\n+)?(?:Weaknesses\s+([^\n]+))?/,
            offenseMatch=/OFFENSE\n+Speed\s+([^\n]+)\n+(?:Melee\s+([^\n]+)(?:\n+)?)?(?:Ranged\s+([^\n]+)(?:\n+)?)?(?:Space\s+([^;]+);)?(?:\s+Reach\s+([^\n]+)(?:\n+)?)?(?:Special Attacks\s+([^\n]+))?(?:\n+)?(?:(.*?(?:Spell-Like Abilities|Psychic Magic|Spells Prepared|Spells Known)\s+.+\n+(?:.+\n*)+))?/,
            tacticsMatch=/(TACTICS\n+.+\n+(?:.+(?:\n+)?)+)/,
            statisticsMatch=/STATISTICS\n+Str\s+([^,]+),\s+Dex\s+([^,]+),\s+Con\s+([^,]+),\s+Int\s+([^,]+),\s+Wis\s+([^,]+),\s+Cha\s+([^\n]+)\n+Base Atk\s+(\+\d+);\s+CMB\s+([^;]+);\s+CMD\s+([^\n]+)(?:\n+)?(?:Feats\s+([^\n]+)(?:\n+)?)?(?:Skills\s+([^\n;]+)(?:;\s+Racial Modifiers\s+([^\n]+))?)?(?:\n+)?(?:Languages\s+([^\n]+))?(?:\n+)?(?:SQ\s+([^\n]+))?(?:\n+)?((?:Combat Gear|Other Gear)\s+[^;\n]+|Gear\n(?:.*(?:\n+)?)+)?(?:;)?(Other Gear\s+[^;\n]+)?(?:\n+)?(.*$)?/,
            saMatch=/((?:SPECIAL ABILITIES)\n+(?:.*(?:\n+)?)+)/,
            ecologyMatch=/((?:ECOLOGY)\n+(?:.*(?:\n+)?)+)/,
            defaultMatch=/(?:Avatar\s+([^\n]+)\n+)?(?:Token\s+([^\n]+)\n+)?(?:([^\n]+)\n+)?([^\t]+)\s*CR\s+([^\n]+)\n+XP\s+([^\n]+)\n+(?:([^\n]+)\n+)??(LG|NG|CG|LN|N|CN|LE|NE|CE)\s+(Fine|Diminutive|Tiny|Small|Medium|Large|Huge|Gargantuan|Colossal)\s+([\w\s]+)(?:\s+(\([\w\s,]+\)))?\n+Init\s+([^;]+);\s+Senses\s+((?:[^;]+;\s+)?Perception\s+[^\n]+)(?:\n+)?(?:Weakness\s+([^\n]+)\n+)?(?:Aura\s+([^\n]+)\n+)?/,
            gearMatch=/((?:GEAR)\n+(?:.*(?:\n+)?)+)/,
            descriptionMatch = /LONG DESCRIPTION\n+((?:.+|\n+)+)/,
            charList=[],
            start = _.now();
            
        text =_.chain(text.replace(/<br\/>/g,'').replace(/<br>/g,'\n').replace(/\n+--------------------/g,'').split(/(?:\n+)?NEW CREATURE(?:\n+)?/))
            .map((t)=>{
                return t.replace(/\ndefense\n/i,'___STATBLOCK PARSE SITE___ DEFENSE\n').replace(/\noffense\n/i,'___STATBLOCK PARSE SITE___ OFFENSE\n').replace(/\ntactics\n/i,'___STATBLOCK PARSE SITE___ TACTICS\n').replace(/\nstatistics\n/i,'___STATBLOCK PARSE SITE___ STATISTICS\n').replace(/\nspecial abilities\n/i,'___STATBLOCK PARSE SITE___ SPECIAL ABILITIES\n').replace(/\necology\n/i,'___STATBLOCK PARSE SITE___ ECOLOGY\n').replace(/\ngear\n/i,'___STATBLOCK PARSE SITE___ GEAR\n').replace(/\nlong description\n/i,'___STATBLOCK PARSE SITE___ LONG DESCRIPTION\n').split('___STATBLOCK PARSE SITE___ ');
            })
            .reject((t)=>{return(_.isUndefined(t) || _.isEmpty(t))})
            .value();
        sendChat('Pathfinder Companion Statblock Parser','/w "'+who+'" Statblock parsing and import of '+text.length+' statblock'+(text.length>1 ? 's':'')+' started. As creatures are successfully parsed, notifications will be sent to chat. Please do not send further API commands until parsing is complete. Newly imported sheets may be unresponsive for a while after import as the sheetworkers finish firing.',null,{noarchive:true});
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
            try{
            usesSpells=false;
            accrue = {};
            attributesToSet = {};
            description = undefined;
            charList.push(_.clone(characters[0]));
            iChar = characters.shift();
            attributes = findObjs({type:'attribute',characterid:iChar.id});
            await createAttrWithWorker('is_npc',iChar.id,attributes,'1');
            await createAttrWithWorker('config-show',iChar.id,attributes,'0');
            statBlock = text.shift();
            parseSection = () =>{
                block = statBlock.shift().trim();
                switch(true){
                    case block.indexOf('DEFENSE')===0:
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
                    parseSection();
                }
            };
            parseSection();
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
                        tokenImage = accrue[k];
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
                        var spellSect = accrue[k].match(/((?:[^\n]+(?=Psychic Magic|Spell-like Abilities|Spells Known|Spells Prepared))?(?:Psychic Magic|Spell-like Abilities|Spells Known|Spells Prepared))/gi);
                        _.each(spellSect,(s)=>{
                            accrue[k]=accrue[k].replace(s,'___Spell Parse Site___'+s);
                        });
                        accrue[k]=accrue[k].split('___Spell Parse Site___');
                        accrue[k]=_.reject(accrue[k],(a)=>{return _.isEmpty(a)});
                        _.each(accrue[k],(a)=>{
                            if(a.match(/(?:Spell-Like Abilities|Psychic Magic)\s/)){
                                attributesToSet['npc-spellike-ability-text'] = attributesToSet['npc-spellike-ability-text'] ? attributesToSet['npc-spellike-ability-text']+a : a.replace(/^\n/,'');
                            }else{
                                if(a.match(/((?:\n)?.*?(?=\(CL[^\n]+)\(CL[^\n]+)\n+/i)){
                                    usesSpells=true
                                    spellsToCreate.push(a.replace(/^\n/,''));
                                }
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
                }catch(err){
                    sendError(err);
                }
            };
            await keyWorker();
            description = ((attributesToSet['character_description'] ? attributesToSet['character_description'] : '')+((attributesToSet['npc-before-combat']||attributesToSet['npc-during-combat']||attributesToSet['npc-morale']) ? '<br><h4>TACTICS</h4>'+(attributesToSet['npc-before-combat'] ? '<b>Before Combat </b>'+attributesToSet['npc-before-combat']+'<br>' : '')+(attributesToSet['npc-during-combat'] ? '<b>During Combat </b>'+attributesToSet['npc-during-combat']+'<br>' : '')+(attributesToSet['npc-morale'] ? '<b>Morale </b>'+attributesToSet['npc-morale']+'<br>' : '') : '')+((attributesToSet['environment']||attributesToSet['organization']||attributesToSet['other_items_treasure']) ? '<br><h4>ECOLOGY</h4>'+(attributesToSet['environment'] ? '<b>Environment </b>'+attributesToSet['environment']+'<br>' : '')+(attributesToSet['organization'] ? '<b>Organization </b>'+attributesToSet['organization']+'<br>' : '')+(attributesToSet['other_items_treasure'] ? '<b>Treasure </b>'+attributesToSet['other_items_treasure']+'<br>' : '') : '')).trim();
            
            description.length>0 ? iChar.set('gmnotes',(description ? description.replace(/\n/g,'<br>') : '')) : undefined;
            keys = _.keys(attributesToSet);
            
            attrWorker = () =>{
                let k = keys.shift();
                setAttr = _.find(attributes,(a)=>{return a.get('name')===k});
                setAttr ? setAttr.set('current',attributesToSet[k]) : attributes.push(createObj('attribute',{characterid:iChar.id,name:k,current:attributesToSet[k]}));
                if(!_.isEmpty(keys)){
                    attrWorker();
                }
            };
            attrWorker();
            await new Promise((resolve,reject)=>{
                _.defer((name,id,attr)=>{
                    resolve(createAttrWithWorker(name,id,attr,'1'));
                },'npc_import_now',iChar.id,attributes);
            });
            if(tokenImage){
                let sizeOp = {
                    'Fine':35,
                    'Diminutive':35,
                    'Tiny':35,
                    'Small':35,
                    'Medium':70,
                    'Large':140,
                    'Huge':210,
                    'Gargantuan':280,
                    'Colossal':350
                };
                page = findObjs({type:'page'})[0];
                token = createObj('graphic',{
                    pageid:page.id,
                    imgsrc:cleanImgSrc(tokenImage),
                    name:iChar.get('name'),
                    represensts:iChar.id,
                    top:0,
                    left:0,
                    width:sizeOp[accrue['size_compendium']],
                    height:sizeOp[accrue['size_compendium']],
                    bar1_value:(state.PFCompanion.defaultToken.bar1Link ? getAttrByName(iChar.id,state.PFCompanion.defaultToken.bar1Link) : ''),
                    bar1_max:(state.PFCompanion.defaultToken.bar1Link ? getAttrByName(iChar.id,state.PFCompanion.defaultToken.bar1Link,'max') : ''),
                    bar2_value:(state.PFCompanion.defaultToken.bar2Link ? getAttrByName(iChar.id,state.PFCompanion.defaultToken.bar2Link) : ''),
                    bar2_max:(state.PFCompanion.defaultToken.bar2Link ? getAttrByName(iChar.id,state.PFCompanion.defaultToken.bar2Link,'max') : ''),
                    bar3_value:(state.PFCompanion.defaultToken.bar3Link ? getAttrByName(iChar.id,state.PFCompanion.defaultToken.bar3Link) : ''),
                    bar3_max:(state.PFCompanion.defaultToken.bar3Link ? getAttrByName(iChar.id,state.PFCompanion.defaultToken.bar3Link,'max') : ''),
                    layer:'walls'
                });
                setDefaultTokenForCharacter(iChar,token);
                token.remove();
            }
            if(!_.isEmpty(attributesToSet['character_description'])){
                setAttr = _.find(attributes,(a)=>{return a.get('name')==='character_description'});
                setAttr ? setAttr.set('current',attributesToSet['character_description']) : attributes.push(createObj('attribute',{characterid:iChar.id,name:'character_description',current:attributesToSet['character_description']}));
            }
            //need to rewrite as parallel loops
            if(usesSpells){
                await new Promise(async (resolve,reject)=>{
                    try{
                        let spellStart = _.now();
                        let spellSetsWorked = [];
                        let spellSetWorker = async (spellSet)=>{
                            try{
                                let spellClass = spellSet.match(/(.*(?= (?:spells known|spells prepared)))/i) ? spellSet.match(/(.*(?= (?:spells known|spells prepared)))/i)[1] : (spellSet.match(/spells prepared/i) ? 'Cleric' : 'Sorceror');
                                let prepared = spellSet.match(/spells prepared/i) ? true : false;
                                let CL = spellSet.match(/\([^\)]*CL\s*(\d+)\)?/i) ? spellSet.match(/\([^\)]*CL\s*(\d+)\)?/i)[1] : undefined;
                                let concentration = spellSet.match(/\([^\)]*concentration\s*((?:\+|\-)?\d+)\)?/) ? spellSet.match(/\([^\)]*concentration\s*((?:\+|\-)?\d+)\)?/)[1] : undefined;
                                if(!CL){
                                    return 'invalid spellclass';
                                }
                                //create spellClass, CL, spont/prepared, Concentration
                                let classNum = await setupSpellClass(iChar,spellClass,CL,prepared,concentration);
                                if(!classNum){
                                    return Promise.resolve('no Class');
                                }
                                let spellLevels = spellSet.replace(/.*(?=\s*(?:spells known|spells prepared)\s*)[^\n]+\n+/i,'').split(/\n+/);
                                let levelArray = [];
                                let levelWorker = async (sl)=>{
                                    try{
                                        let level=sl.match(/^\d\w{0,2}\s*(?:\([^\)]+\))?(?:\-|—)/) ? sl.match(/^\d\w{0,2}\s*(?:\([^\)]+\))?(?:\-|—)/)[0] : undefined;
                                        if(level){
                                            sl = sl.replace(level,'');
                                            let commaMatch = sl.match(/,/g);
                                            let commaIndex=0;
                                            let spells = [];
                                            let workedSpells=[];
                                            _.each(commaMatch,(cm)=>{
                                                let commaCheck = commaIndex===0 ? sl.match(/^[^,]*\([^\)]+,[^\(]+\)/) : sl.match(/^[^,]*\([^\)]+,[^\(]+,[^\(]+\)/);
                                                if(!commaCheck){
                                                    let newSpell = sl.slice(0,sl.indexOf(',',commaIndex+ 1));
                                                    sl=sl.replace(newSpell+',','').trim();
                                                    spells.push(newSpell.trim());
                                                    commaIndex = 0;
                                                }else{
                                                    commaIndex=sl.indexOf(',',commaIndex+ 1);
                                                }
                                            });
                                            spells.push(sl.trim());
                                            sl = level.match(/^(\d)(?:st|nd|th|rd)?/);
                                            sl = sl ? sl[1] : undefined;
                                            if(!sl){
                                                return 'Invalid spell level';
                                            }
                                            let spellWorker = async () =>{
                                                let s = spells.shift();
                                                await new Promise((resolve,reject)=>{
                                                    _.defer((c,n,sp,lev,spst,p)=>{
                                                        resolve(createSpell(c,n,sp,lev,spst,p));
                                                    },iChar,classNum,s,sl,spellStart,prepared);
                                                });
                                                if(!_.isEmpty(spells)){
                                                    return spellWorker();
                                                }else{
                                                    return 'spells worked';
                                                }
                                            };
                                            if(!_.isEmpty(spells)){
                                                return await spellWorker();
                                            }else{
                                                return 'no spells';
                                            }
                                        }else{
                                            return Promise.resolve('Invalid Line');
                                        }
                                    }catch(err){
                                        sendError(err);
                                    }
                                };
                                _.each(spellLevels,(sL)=>{
                                    levelArray.push(levelWorker(sL.trim()));
                                });
                                return Promise.all(levelArray);
                            }catch(err){
                                sendError(err);
                            }
                        };
                        _.each(spellsToCreate,(stc)=>{
                            spellSetsWorked.push(spellSetWorker(stc));
                        });
                        resolve(Promise.all(spellSetsWorked));
                    }catch(err){
                        sendError(err);
                    }
                });
                await new Promise((resolve,reject)=>{
                    _.defer((c,a)=>{
                        resolve(createAttrWithWorker('use_spells',c,a,'1'));
                    },iChar.id,attributes);
                });
            }
            await new Promise((resolve,reject)=>{
                _.defer((iC,w)=>{
                    log('  > Pathfinder Companion Statblock Parser:'+iC.get('name')+' imported <');
                    sendChat('Pathfinder Companion Statblock Parser','/w "'+w+'" <u><b>['+iC.get('name')+'](https://journal.roll20.net/character/'+iC.id+')</b></u> imported',null,{noarchive:true});
                    resolve('notification sent');
                },iChar,who);
            });
            if(!_.isEmpty(text)){
                _.defer(parser);
            }else{
                charListLength=charList.length;
                if(state.PFCompanion.TAS==='auto' || state.PFCompanion.ResourceTrack==='on'){
                    var charToInit;
                    var charInit = async () => {
                        charToInit = charList.shift();
                        await initializeCharacter(charToInit);
                        log('  > Pathfinder Companion Statblock Parser:'+charToInit.get('name')+' initialized <');
                        if(!_.isEmpty(charList)){
                            return new Promise((resolve,reject)=>{
                                _.defer(()=>{resolve(charInit())});
                            });
                        }else{
                            log('  > Pathfinder Companion Statblock Parser: All NPCs initialized. Total import time:'+((_.now()-start)/1000)+' seconds <');
                            return 'All Characters Initialized';
                        }
                    };
                    await charInit();
                }
                await new Promise((resolve,reject)=>{
                    _.defer((cL,w,s)=>{
                        log('  > Pathfinder Companion Statblock Parser: '+cL+' character'+(cL>1 ? 's':'')+' parsed and imported in '+((_.now()-s)/1000)+' seconds');
                        sendChat('Pathfinder Companion Statblock Parser','/w "'+w+'" '+cL+' character'+(cL ? 's':'')+'  parsed and imported in '+((_.now()-s)/1000)+' seconds',null,{noarchive:true});
                        resolve('Import Finished');
                    },charListLength,who,start);
                });
            }
            }catch(err){
                sendError(err);
            }
        };//end of parser()
        parser();
        }catch(err){
            sendError(err);
        }
    },
    
    //generates a valid row ID for creating a row in a repeating section
    generateRowID = function(){
        var a = 0, b = [];
        var c = (new Date()).getTime() + 0, d = c === a;
        a = c;
        for (var e = new Array(8), f = 7; 0 <= f; f--) {
            e[f] = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz".charAt(c % 64);
            c = Math.floor(c / 64);
        }
        c = e.join("");
        if (d) {
            for (f = 11; 0 <= f && 63 === b[f]; f--) {
                b[f] = 0;
            }
            b[f]++;
        } else {
            for (f = 0; 12 > f; f++) {
                b[f] = Math.floor(64 * Math.random());
            }
        }
        for (f = 0; 12 > f; f++){
            c += "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz".charAt(b[f]);
        }
        return c.replace(/_/g, "Z");
    },
    
    setupSpellClass = async function(character,spellClass,CL,prepared,concentration){
        var classNumAttr,classNum,
            classWork = [0,1,2];
        if(getAttrByName(character.id,'use_spells')*1!==1){
            
        }
        _.some(classWork,(cw)=>{
            classNumAttr = findObjs({type:'attribute',characterid:character.id,name:'spellclass-'+cw+'-name'})[0];
            classNum = cw;
            if(!classNumAttr){
                classNumAttr = createObj('attribute',{name:'spellclass-'+cw+'-name',characterid:character.id,current:spellClass});
                return true;
            }else if(classNumAttr.get('current')===spellClass){
                return true;
            }else{
                return false;
            }
        });
        if(!classNumAttr){
            return undefined;
        }
        await createAttrWithWorker('spellclass-'+classNum+'-level',character.id,null,CL);
        await createAttrWithWorker('spellclass-'+classNum+'-casting_type',character.id,null,(prepared ? 2 : 1));
        concentration ? await createAttrWithWorker('concentration-'+classNum+'-misc',character.id,null,(parseInt(concentration.replace(/\+|\s/g,''))-parseInt(CL))) : undefined;
        return ''+classNum;
    },
    
    createSpell = async function(character,classNum,spell,spellLevel,start,prepared){
        try{
            var rowID = generateRowID(),
                attributes = findObjs({type:'attribute',characterid:character.id}),
                spellStats = {
                    name:spell,
                    spell_level:spellLevel,
                    spell_level_r:spellLevel
                },
                classWork=[0,1,2],
                uses = prepared ? 1:0,
                classNum,spellMatch,spellName,spellDC,currDC,DCmod,roll,spell_level,DCmatch,usePromise;
                
            if(!rowID){
                return undefined;
            }
            spellMatch = spell.match(/(.*?)\((?:(DC\s*\d+|x?\d+)(?:,\s*(DC\s*\d+|x?\d+))?)?\)/);
            if(spellMatch){
                spellName = spellMatch[1].trim();
                DCmatch = spellMatch[2].match(/DC\s*(\d+)/);
                if(DCmatch){
                    spellDC = DCmatch[1].trim();
                }else{
                    uses+=parseInt(spellMatch[2].replace(/x/i,'').trim())- 1;
                }
                if(spellMatch[3]){
                    if(spellDC){
                        uses+=parseInt(spellMatch[3].replace(/x/i,'').trim())- 1
                    }else{
                        spellDC=spellMatch[3].match(/DC\s*(\d+)/) ? spellMatch[3].match(/DC\s*(\d+)/)[1] : undefined;
                    }
                }
            }else{
                spellName = spell.trim();
            }
            spellName = spellName.replace(/\[|\]|\(|\)/g,'');
            //assign/create attributes that trigger sheetworkers
            spell_level = await createAttrWithWorker('repeating_spells_'+rowID+'_spell_level',character.id,null,spellLevel);
            await createAttrWithWorker('repeating_spells_'+rowID+'_spellclass_number',character.id,null,classNum);
            let name = createObj('attribute',{name:'repeating_spells_'+rowID+'_name',characterid:character.id,current:spellName});
            if(uses>0){
                usePromise = await createAttrWithWorker('repeating_spells_'+rowID+'_used',character.id,null,uses);
            }else{
                usePromise=Promise.resolve('no uses');
            }
            if(spellDC){
                currDC = getAttrByName(character.id,'repeating_spells_'+rowID+'_savedc');
                if(currDC){
                    DCmod = parseInt(spellDC)-parseInt(currDC);
                    createObj('attribute',{name:'repeating_spells_'+rowID+'_save',characterid:character.id,current:'Some Save'});
                    //let savedc = createObj('attribute',{name:'repeating_spells_'+rowID+'_savedc',characterid:character.id,current:spellDC});
                    let savemisc = await createAttrWithWorker('repeating_spells_'+rowID+'_DC_misc',character.id,null,DCmod);
                    //createObj('attribute',{name:'repeating_spells_'+rowID+'_DC_misc',characterid:character.id,current:DCmod});
                }
            }
            
            //assign/create attributes that don't trigger sheetworkers
            return rowID;
        }catch(err){
            sendError(err);
        }
    },
    
    createAttrWithWorker = function(nam,id,attributes,curr,mx){
        try{
            attributes = attributes ? attributes : findObjs({type:'attribute',characterid:id});
            var attribute,
                retValue = new Promise((resolve,reject)=>{
                    onSheetWorkerCompleted(()=>{
                        resolve(attribute);
                    });
                });
                
            attribute = _.find(attributes,(a)=>{return a.get('name').toLowerCase()===nam.toLowerCase()});
            if(!attribute){
                attribute = createObj('attribute',{characterid:id,name:nam});
                attributes.push(attribute);
            }
            if(!isNaN(curr) && !isNaN(mx)){
                attribute.setWithWorker({current:curr,max:mx});
            }else if(!isNaN(curr) || !isNaN(mx)){
                attribute.setWithWorker((mx ? 'max' : 'current'),(mx ? mx : curr));
            }
            return retValue;
        }catch(err){
            sendError(err);
        }
    },
    
    //Functions for applying effects of attacks, spells, abilities, and other
    affectWithAttackDialog = function(msg,who){
        var dialog = '&{template:pf_attack} ',
            attacks=[],
            damage=[],
            attackMatch = msg.content.match(/{{attack(\d)?=(.*?)}}/g),
            ordinal = {
                '1':'st',
                '2':'nd',
                '3':'rd',
                '4':'th',
                '5':'th',
                '6':'th',
                '7':'th',
                '8':'th',
                '9':'th'
            },
            rowID=msg.content.match(/\|\|rowid=([^\|]+)\|\|/),
            specificMatch,precision,precisiontype,precisiong,precisiongtype,critical,bonuscrit,bonuscrittype,bonuscritg,bonuscritgtype,queryCommand;
            
        if(!rowID){
            return;
        }
        rowID = rowID[1];
        dialog += msg.content.match(/{{name=.*?(?=}})}}/) ? msg.content.match(/{{name=.*?(?=}})}}/)[0] : '{{name=Unknown Attack}}';
        _.each(attackMatch,(am)=>{
            specificMatch = am.match(/{{attack(\d)?=(.*?)}}/);
            attacks.push({
                'num':specificMatch[1] || '1',
                'name':(specificMatch[1] || '1')+ordinal[(specificMatch[1] || '1')]+' '+(msg.content.match(new RegExp('{{attack'+(specificMatch[1]||'1')+'name=(.*?)}}')) ? (_.isEmpty(msg.content.match(new RegExp('{{attack'+(specificMatch[1]||'1')+'name=(.*?)}}'))[1]) ? 'Attack' : msg.content.match(new RegExp('{{attack'+(specificMatch[1]||'1')+'name=(.*?)}}'))[1]) : 'Attack')
            });
        });
        _.each(attacks,(a)=>{
            precision = msg.content.match(new RegExp('{{precision_dmg'+(a.num==='1' ? '' : a.num)+'1=(.*?)}}')) ? msg.content.match(new RegExp('{{precision_dmg'+(a.num==='1' ? '' : a.num)+'1=(.*?)}}'))[1] : undefined;
            precisiontype = precision ? msg.content.match(new RegExp('{{precision_dmg1_type=(.*?)}}'))[1] : undefined;
            precisiong = msg.content.match(new RegExp('{{precision_dmg'+(a.num==='1' ? '' : a.num)+'2=(.*?)}}')) ? msg.content.match(new RegExp('{{precision_dmg'+(a.num==='1' ? '' : a.num)+'2=(.*?)}}'))[1] : undefined;
            precisiongtype = precisiong ? msg.content.match(new RegExp('{{precision_dmg2_type=(.*?)}}'))[1] : undefined;
            critical = msg.content.match(new RegExp('{{crit_damage'+(a.num==='1' ? '' : a.num)+'=(.*?)}}')) ? msg.content.match(new RegExp('{{crit_damage'+(a.num==='1' ? '' : a.num)+'=(.*?)}}'))[1] : undefined;
            bonuscrit=msg.content.match(new RegExp('{{critical_dmg'+(a.num==='1' ? '' : a.num)+'1=(.*?)}}')) ? msg.content.match(new RegExp('{{critical_dmg'+(a.num==='1' ? '' : a.num)+'1=(.*?)}}'))[1] : undefined;
            bonuscrittype = bonuscrit ? msg.content.match(new RegExp('{{critical_dmg1_type=(.*?)}}'))[1] : undefined;
            bonuscritg=msg.content.match(new RegExp('{{critical_dmg'+(a.num==='1' ? '' : a.num)+'2=(.*?)}}')) ? msg.content.match(new RegExp('{{critical_dmg'+(a.num==='1' ? '' : a.num)+'2=(.*?)}}'))[1] : undefined;
            bonuscritgtype = bonuscritg ? msg.content.match(new RegExp('{{critical_dmg2_type=(.*?)}}'))[1] : undefined;
            damage.push({
                'damage':msg.content.match(new RegExp('{{damage'+(a.num==='1' ? '' : a.num)+'=(.*?)}}')) ? msg.content.match(new RegExp('{{damage'+(a.num==='1' ? '' : a.num)+'=(.*?)}}'))[1] : undefined,
                'damagetype':msg.content.match(/{{type=(.*?)}}/) ? msg.content.match(/{{type=(.*?)}}/)[1] : '',
                'precision':precision,
                'precisiontype':precisiontype,
                'precisiong':precisiong,
                'precisiongtype':precisiongtype,
                'critical':critical,
                'bonuscrit':bonuscrit,
                'bonuscrittype':bonuscrittype,
                'bonuscritg':bonuscritg,
                'bonuscritgtype':bonuscritgtype
            });
        });
        _.each(_.range(attacks.length),(r)=>{
            dialog+='{{'+attacks[r].name+'='
                +makeButton(HE('!pfc --affect,rid='+rowID+',damage='+(damage[r].damage||'')+'>'+(damage[r].damagetype||'')+',precision='+(damage[r].precision||'')+'>'+(damage[r].precisiontype||'')+',precisiong='+(damage[r].precisiong||'')+'>'+(damage[r].precisiongtype||'')+'|@{target|token_id}'),
                    '<span style="font-family:pictos custom;">[</span>','black','transparent','Apply All Non-Crit Damage')
                +makeButton(HE('!pfc --affect,rid='+rowID+',damage='+(damage[r].damage||'')+'>'+(damage[r].damagetype||'')+(!_.isEmpty(damage[r].critical) ? ',critical='+damage[r].critical+'>'+(damage[r].damagetype||'') : '')+',precision='+(damage[r].precision||'')+'>'+(damage[r].precisiontype||'')+',precisiong='+(damage[r].precisiong||'')+'>'+(damage[r].precisiongtype||'')
                    +',bonuscrit='+(damage[r].bonuscrit||'')+'>'+(damage[r].bonuscrittype||'')+',bonuscritg='+(damage[r].bonuscritg||'')+'>'+(damage[r].bonuscritgtype||'')+'|@{target|token_id}'),
                    '<span style="font-family:pictos custom;">t</span>','black','transparent','Apply All Damage with Critical')
            +'}}';
        });
        sendChat('Pathfinder Companion','/w "'+who+'" '+dialog);
        if(!playerIsGM(msg.playerid)){
            sendChat('Pathfinder Companion','/w gm '+dialog);
        }
        //need button to apply all damage, base only, custom
    },
    
    affectWithSpellDialog = function(msg,who){
        var dialog = '&{template:pf_attack} ',
            rowID=msg.content.match(/\|\|rowid=([^\|]+)\|\|/) ? msg.content.match(/\|\|rowid=([^\|]+)\|\|/)[1] : undefined,
            nameMatch = msg.content.match(/{{name=.*?}}/) ? msg.content.match(/{{name=.*?}}/)[0] : undefined,
            targetMatch = msg.content.match(/{{targets=(.*?)}}/) ? msg.content.match(/{{targets=(.*?)}}/)[1] : undefined,
            saveMatch = msg.content.match(/{{saving_throw=(.*?)}}/) ? msg.content.match(/{{saving_throw=(.*?)}}/)[1] : undefined,
            dcMatch = msg.content.match(/{{dc=(.*?)}}/) ? msg.content.match(/{{dc=(.*?)}}/)[1] : undefined,
            schoolMatch = msg.content.match(/{{school=(.*?)}}/) ? msg.content.match(/{{school=(.*?)}}/)[1] : undefined,
            damage = msg.content.match(/{{spelldamage=(.*?)}}/) ? msg.content.match(/{{spelldamage=(.*?)}}/)[1] : undefined,
            damageType = msg.content.match(/{{spelldamagetype=(.*?)}}/) ? msg.content.match(/{{spelldamagetype=(.*?)}}/)[1] : undefined,
            subTargets = {},
            effectsMatch = msg.content.match(/{{description=All Effects:([^\n}]+)/i) ? msg.content.match(/{{description=All Effects:([^\n}]+)/i)[1].trim().split(/\s*;\s*/) : [],
            saveEffects,
            targetingButton,autoButton,saveButton,failButton;
            
        if(!rowID || !schoolMatch){
            return;
        }
        if(!_.isEmpty(effectsMatch)){
            saveEffects = _.reject(effectsMatch,(e)=>{
                return saveMatch.match(new RegExp(e,'i'));
            });
        }else{
            saveEffects = [];
        }
        dialog+=nameMatch ? nameMatch : '{{name=Unknown Spell}}';
        if(targetMatch){
            subTargets={
                targets:targetMatch.match(/(.*?)?(?:\/|}})/) ? targetMatch.match(/(.*?)?(?:\/|}})/)[1] : undefined,
                area : targetMatch.match(/\/(.*?)\//) ? targetMatch.match(/\/(.*?)\//)[1] : undefined
            };
            
            if(subTargets.area){
                let size = subTargets.area.match(/\d+(?:'|\s*ft)(?:\s+radius)?/i);
                let shape = subTargets.area.match(/spread|cube|line|cone|burst|emanation/i);
                if(size && shape){
                    targetingButton = makeButton(HE('!pfc --aoe,size='+size[0]+',shape='+shape[0]+'|'+(shape[0].match(/cone|line|wall/i) ? "@{target|Origin Token|token_id}|@{target|Primary Target|token_id}" : '@{target|Token at the Center of the AOE, You will be able to reposition this after it is made|token_id}')),'<span style="font-family:pictos;">`</span>','black','white','Select affected Tokens');
                }
            }else{
                targetingButton = '';
            }
        }
        autoButton=makeButton(HE('!pfc --affect,rollSave,rid='+rowID+',schoolMatch='+schoolMatch+(damage ? ',damage='+damage+'>'+(damageType||'') : '')+(_.isEmpty(effectsMatch) ? '' : ',effects='+effectsMatch.join(' '))+(saveMatch ? ',save=dc'+dcMatch+' '+saveMatch: '')+(subTargets.area ? '?{Make sure you have the AOE path selected,Hit Cancel if you do not|}' : '|@{target||token_id}')),'<span style="font-family:pictos;">e</span>','black','transparent','Automatically determine saves');
        saveButton=makeButton(HE('!pfc --affect,rid='+rowID+',schoolMatch='+schoolMatch+(damage ? ',damage='+damage+'>'+(damageType||'') : '')+(_.isEmpty(saveEffects) ? '' : ',effects='+saveEffects.join(' '))+'|@{target||token_id}'),'<span style="font-family:pictos custom;">t</span>','black','transparent','Successful Save');
        failButton=makeButton(HE('!pfc --affect,rid='+rowID+',schoolMatch='+schoolMatch+(damage ? ',damage='+damage+'>'+(damageType||'') : '')+(_.isEmpty(effectsMatch) ? '' : ',effects='+effectsMatch.join(' '))+'|@{target||token_id}'),'<span style="font-family:pictos custom;">r</span>','black','transparent','Failed Save');
        dialog+='{{subtitle='+targetingButton+'}}'+'{{Apply Effects='+saveButton+failButton+autoButton+'}}';
        sendChat('Pathfinder Companion','/w "'+who+'" '+dialog);
    },
    
    affectWithAbilityDialog = function(msg,who){
        var dialog = '&{template:pf_attack} ',
            rowID=msg.content.match(/\|\|rowid=([^\|]+)\|\|/) ? msg.content.match(/\|\|rowid=([^\|]+)\|\|/)[1] : undefined,
            nameMatch = msg.content.match(/{{name=.*?}}/) ? msg.content.match(/{{name=.*?}}/)[0] : undefined,
            targetMatch = msg.content.match(/{{targetarea=(.*?)}}/) ? msg.content.match(/{{targetarea=(.*?)}}/)[1] : undefined,
            saveMatch = msg.content.match(/{{save=(.*?)}}/) ? msg.content.match(/{{save=(.*?)}}/)[1] : undefined,
            dcMatch = msg.content.match(/{{savedc=(.*?)}}/) ? msg.content.match(/{{savedc=(.*?)}}/)[1] : undefined,
            schoolMatch = msg.content.match(/{{cust_category=(.*?)}}/) ? msg.content.match(/{{cust_category=(.*?)}}/)[1] : undefined,
            damage = msg.content.match(/{{damage=(.*?)}}/) ? msg.content.match(/{{damage=(.*?)}}/)[1] : undefined,
            damageType = msg.content.match(/{{damagetype=(.*?)}}/) ? msg.content.match(/{{damagetype=(.*?)}}/)[1] : undefined,
            subTargets = {},
            targetingButton,applicationButton;
            
        if(!rowID || !schoolMatch){
            return;
        }
        dialog+=nameMatch || '{{name=Unknown Ability}}';
        if(targetMatch){
            subTargets={
                targets:targetMatch.match(/(.*?)?(?:\/|}})/) ? targetMatch.match(/(.*?)?(?:\/|}})/)[1] : undefined,
                area : targetMatch.match(/\/(.*?)\//) ? targetMatch.match(/\/(.*?)\//)[1] : undefined
            };
            
            if(subTargets.area){
                let size = subTargets.area.match(/\d+(?:'|\s*ft)(?:\s+radius)?/i);
                let shape = subTargets.area.match(/spread|cube|line|cone|burst|emanation/i);
                if(size && shape){
                    targetingButton = makeButton(HE('!pfc --aoe,size='+size[0]+',shape='+shape[0]+'|'+(shape[0].match(/cone|line|wall/i) ? "@{target|Origin Token|token_id}|@{target|Primary Target|token_id}" : '@{target|Token at the Center of the AOE, You will be able to reposition this after it is made|token_id}')),'<span style="font-family:pictos;">`</span>','black','white','Select affected Tokens');
                }
            }else{
                targetingButton = '';
            }
        }
        applicationButton=makeButton(HE('!pfc --affect,rid='+rowID+',schoolMatch='+schoolMatch+(damage? ',damage='+damage+'>'+(damageType||'') : '')+(saveMatch ? ',save=dc'+dcMatch+' '+saveMatch: '')+(subTargets.area ? '?{Make sure you have the AOE path selected,Hit Cancel if you do not|}' : '|@{target||token_id}')),'<span style="font-family:pictos;">e</span>','black','transparent','Apply Effects');
        dialog+='{{subtitle='+targetingButton+'}}'+'{{Apply Effects='+applicationButton+'}}';
        sendChat('Pathfinder Companion','/w "'+who+'" '+dialog);
    },
    
    mapBurst = async function(start,radius){
        try{
            var accumulator = [],
                path=[],
                initCoord = ['M',start.x+radius,start.y],
                square,newCoord,squareCoord,newSquare,dist,pathLength,shape,
                accumWorker = async () =>{
                    square = accumulator.shift();
                    dist = pDist({x:square[1],y:square[2]},start);
                    if(dist > radius && (square[1]-start.x)>=(square[2]-start.y)){
                        path.push(square);
                        accumulator.push(['L',square[1]- 70,square[2]]);
                    }else if((square[1]-start.x)>=(square[2]-start.y)){
                        path.push(square);
                        //                      X           Y           Count
                        accumulator.push(['L',square[1],square[2]+ 70]);
                    }
                    if(_.isEmpty(accumulator)){
                        return 'path figured';
                    }else{
                        return new Promise((resolve,reject)=>{
                            _.defer(()=>{resolve(accumWorker())});
                        });
                    }
                };
                
            accumulator.push(initCoord);
            await accumWorker();
            pathLength = path.length;
            _.each(_.range(1,path.length+ 1),(r)=>{
                if(path[pathLength-r][2]!==path[pathLength-r][1]){
                    path.push(['L',path[pathLength-r][2],path[pathLength-r][1]]);
                }
            });
            pathLength = path.length;
            _.each(_.range(1,path.length+ 1),(r)=>{
                if(path[pathLength-r][1]!==radius){
                    path.push(['L',(-path[pathLength-r][1]+radius*2),path[pathLength-r][2]]);
                }
            });
            pathLength = path.length;
            _.each(_.range(1,path.length+ 1),(r)=>{
                if(path[pathLength-r][1]!==0||path[pathLength-r][2]!==radius){
                    path.push(['L',path[pathLength-r][1],(-path[pathLength-r][2]+radius*2)]);
                }
            });
            return path;
        }catch(err){
            sendError(err);
        }
    },
    
    mapCone = async function(obj,target,size){
        try{
            var angle,
                dist = target ? pDist(obj,target) : undefined,
                accumulator = [],
                path=[],
                finalPath = [],
                cone45,cone90,square,newCoord,squareCoord,newSquare,pathLength,leftMod,topMod,width,height,objMatch,
                accumWorker = async () =>{
                    square = accumulator.shift();
                    dist = pDist({x:square[1],y:square[2]},{x:0,y:0});
                    if(dist > size- 35 && (square[1])>=(square[2])){
                        path.push(square);
                        accumulator.push(['L',square[1]- 70,square[2]]);
                    }else if((square[1])>=(square[2])){
                        path.push(square);
                        //                      X           Y           Count
                        accumulator.push(['L',square[1],square[2]+ 70]);
                    }
                    if(_.isEmpty(accumulator)){
                        return 'path figured';
                    }else{
                        return new Promise((resolve,reject)=>{
                            _.defer(()=>{resolve(accumWorker())});
                        });
                    }
                };
                
            if(target){
                //Right Hemisphere
                if(target.x>obj.x){
                    //Top Right Quadrant
                    if(target.y<obj.y){
                        angle = getRotation(dist,(target.x-obj.x));
                    //Bottom right Quadrant
                    }else if(target.y>obj.y){
                        angle = 180-getRotation(dist,((target.x-obj.x)))
                    //East
                    }else{
                        angle = 90;
                    }
                //Left Hemisphere
                }else if(target.x<obj.x){
                    //top Left Hemisphere
                    if(target.y<obj.y){
                        angle = 360+getRotation(dist,(target.x-obj.x));
                    //bottom Left Hemisphere
                    }else if(target.y>obj.y){
                        angle = 180-getRotation(dist,(target.x-obj.x));
                    //West
                    }else{
                        angle = 270;
                    }
                }else{
                    //South
                    if(target.y>obj.y){
                        angle=180;
                    //North
                    }else{
                        angle = 0;
                    }
                }
            }else{
                objMatch = obj.get('controlledby').match(/(\d+)ft\s+cone(.*?)#([^,]+)/);
                angle = Math.round((objMatch[2]*1+obj.get('rotation')*1)/45)*45;
                angle = angle >= 360 ? angle - (~~(angle/360))*360 : angle;
                
                size = (objMatch[1]/5)*70;
            }
                path.push(['M',0,0],['L',size,0]);
                accumulator.push(['L',size,70]);
                await accumWorker();
                pathLength = path.length;
                _.each(_.range(2,path.length+ 1),(r)=>{
                    path.push(['L',path[pathLength-r][2],path[pathLength-r][1]]);
                });
                cone45 = _.clone(path);
                path = [];
                if(size===210){
                    cone90=[['M',0,35],['L',70,35],['L',70,105],['L',210,105],['L',210,-105],['L',70,-105],['L',70,-35],['L',0,-35],['L',0,35]];
                }else{
                    path.push(['M',size,0]);
                    accumulator.push(['L',size,70]);
                    await accumWorker();
                    accumulator.push(['L',path[path.length - 1][1] - 70,path[path.length - 1][2]]);
                    while(!_.isEmpty(accumulator)){
                        square = accumulator.shift();
                        dist = pDist({x:0,y:0},{x:square[1],y:square[2]});
                        path.push(square);
                        if(Math.round(Math.abs(getRotation(dist,square[1])))<45){
                            accumulator.push(['L',square[1],square[2] - 70]);
                        }else if(square[1]>0){
                            accumulator.push(['L',square[1] - 70,square[2]]);
                        }
                    }
                    pathLength = path.length;
                    _.each(_.range(1,pathLength + 1),(r)=>{
                        path.push(['L',path[pathLength-r][1],-path[pathLength-r][2]]);
                    });
                    cone90 = _.clone(path);
                }
                switch(true){
                    case (22.5<=angle && angle <67.5):
                        pathLength = cone45.length;
                        _.each(_.range(1,pathLength+ 1),(r)=>{
                            finalPath.push([(_.isEmpty(finalPath) ? 'M':'L'),cone45[pathLength-r][1],(-cone45[pathLength-r][2]+ size)]);
                        });
                        leftMod = 1;
                        topMod = -1;
                        width = Math.abs(_.max(finalPath,(p)=>{return Math.abs(p[1])})[1]);
                        height = Math.abs(_.max(finalPath,(p)=>{return Math.abs(p[2])})[2]);
                        shape = 45;
                        break;
                    case (67.5<=angle && angle <112.5):
                        finalPath = cone90;
                        leftMod = 1;
                        topMod = 0;
                        width = Math.abs(_.max(finalPath,(p)=>{return Math.abs(p[1])})[1]);
                        height = Math.abs(_.max(finalPath,(p)=>{return Math.abs(p[2])})[2]*2);
                        _.each(_.range(finalPath.length),(r)=>{
                            finalPath[r][2]=finalPath[r][2]+height/2;
                        });
                        shape = 90;
                        break;
                    case (112.5<=angle && angle <157.5):
                        finalPath = cone45;
                        leftMod = 1;
                        topMod = 1;
                        width = Math.abs(_.max(finalPath,(p)=>{return Math.abs(p[1])})[1]);
                        height = Math.abs(_.max(finalPath,(p)=>{return Math.abs(p[2])})[2]);
                        shape = 135;
                        break;
                    case (157.5<=angle && angle <202.5):
                        pathLength = cone90.length;
                        _.each(_.range(1,pathLength+ 1),(r)=>{
                            finalPath.push([(_.isEmpty(finalPath) ? 'M':'L'),(cone90[pathLength-r][2]),(cone90[pathLength-r][1])]);
                        });
                        leftMod = 0;
                        topMod = 1;
                        width = Math.abs(_.max(finalPath,(p)=>{return Math.abs(p[1])})[1]*2);
                        height = Math.abs(_.max(finalPath,(p)=>{return Math.abs(p[2])})[2]);
                        _.each(_.range(finalPath.length),(r)=>{
                            finalPath[r][1]=finalPath[r][1]+width/2;
                        });
                        shape = 180;
                        break;
                    case (202.5<=angle && angle <247.5):
                        pathLength = cone45.length;
                        _.each(_.range(1,pathLength+ 1),(r)=>{
                            finalPath.push([(_.isEmpty(finalPath) ? 'M':'L'),(-cone45[pathLength-r][1]+size),(cone45[pathLength-r][2])]);
                        });
                        leftMod = -1;
                        topMod = 1;
                        width = Math.abs(_.max(finalPath,(p)=>{return Math.abs(p[1])})[1]);
                        height = Math.abs(_.max(finalPath,(p)=>{return Math.abs(p[2])})[2]);
                        shape = 225;
                        break;
                    case (247.5<=angle && angle <292.5):
                        pathLength = cone90.length;
                        _.each(_.range(1,pathLength+ 1),(r)=>{
                            finalPath.push([(_.isEmpty(finalPath) ? 'M':'L'),(-cone90[pathLength-r][1]),(cone90[pathLength-r][2])]);
                        });
                        leftMod = -1;
                        topMod = 0;
                        width = Math.abs(_.max(finalPath,(p)=>{return Math.abs(p[1])})[1]);
                        height = Math.abs(_.max(finalPath,(p)=>{return Math.abs(p[2])})[2]*2);
                        _.each(_.range(finalPath.length),(r)=>{
                            finalPath[r][1]=finalPath[r][1]+width
                            finalPath[r][2]=finalPath[r][2]+height/2;
                        });
                        shape = 270;
                        break;
                    case (292.5<=angle && angle <337.5):
                        pathLength = cone45.length;
                        _.each(_.range(1,pathLength+ 1),(r)=>{
                            finalPath.push([(_.isEmpty(finalPath) ? 'M':'L'),(-cone45[pathLength-r][1]+size),(-cone45[pathLength-r][2]+size)]);
                        });
                        leftMod = -1;
                        topMod = -1;
                        width = Math.abs(_.max(finalPath,(p)=>{return Math.abs(p[1])})[1]);
                        height = Math.abs(_.max(finalPath,(p)=>{return Math.abs(p[2])})[2]);
                        shape = 315;
                        break;
                    default:
                        pathLength = cone90.length;
                        _.each(_.range(1,pathLength+ 1),(r)=>{
                            finalPath.push([(_.isEmpty(finalPath) ? 'M':'L'),(cone90[pathLength-r][2]),(-cone90[pathLength-r][1])]);
                        });
                        leftMod = 0;
                        topMod = -1;
                        width = Math.abs(_.max(finalPath,(p)=>{return Math.abs(p[1])})[1]*2);
                        height = Math.abs(_.max(finalPath,(p)=>{return Math.abs(p[2])})[2]);
                        _.each(_.range(finalPath.length),(r)=>{
                            finalPath[r][1]=finalPath[r][1]+width/2
                            finalPath[r][2]=finalPath[r][2]+height;
                        });
                        shape = 0;
                }
                if(target){
                    return [finalPath,leftMod,topMod,width,height,'cone'+shape];
                }else{
                    let angleDiff = angle - objMatch[2];
                    let topFigure = {
                        '0':(na)=>(na===45 || na===315 || na===0) ? 0 : ((na===90 || na===270) ? (height/2) : (height+ 70)),
                        '45':(na)=>topFigure['0'](na),
                        '90':(na)=>(na===270 || na===90) ? 0 : ((na<270 && na>90) ? 1 : -1)*(height/2),
                        '135':(na)=>(na===135 || na===180 || na===225) ? 0 : ((na===90 || na===270) ? -(height/2) : -(height+ 70)),
                        '180':(na)=>topFigure['135'](na),
                        '225':(na)=>topFigure['135'](na),
                        '270':(na)=>topFigure['90'](na),
                        '315':(na)=>topFigure['0'](na),
                    };
                    let leftFigure = {
                        '0':(na)=>(na===0 || na===180) ? 0 : (na<180 ? 1 : -1)*(width/2),
                        '45':(na)=>(na===45 || na===90 || na===135) ? 0 : ((na === 180 || na ===0) ? -(width/2) : -(width+ 70)),
                        '90':(na)=>leftFigure['45'](na),
                        '135':(na)=>leftFigure['45'](na),
                        '180':(na)=>leftFigure['0'](na),
                        '225':(na)=>(na===225 || na===270 || na===315) ? 0 : ((na === 180 || na ===0) ? (width/2) : (width+ 70)),
                        '270':(na)=>leftFigure['225'](na),
                        '315':(na)=>leftFigure['225'](na),
                    };
                    createObj('path',{
                        layer:'objects',
                        controlledby:'all,'+objMatch[1]+'ft cone'+angle+'#'+objMatch[3],
                        stroke:obj.get('stroke'),
                        pageid:obj.get('pageid'),
                        path:JSON.stringify(finalPath),
                        top:obj.get('top')*1+ topFigure[objMatch[2]](angle),
                        left:obj.get('left')*1+ leftFigure[objMatch[2]](angle),
                        width:width,
                        height:height,
                    });
                    obj.remove();
                }
        }catch(err){
            sendError(err);
        }
    },
    
    mapLine = async function(obj,target,length,polyID,strokeColor,pageID){
        try{
        var originPath,destPath,square,lineStart,pathLength,angleLimit,newSquare,width,height,finalLine,trueWidth,trueHeight,xMod,yMod,
            lines=[],
            accumulator=[],
            dist = target ? pDist(obj,target) : undefined,
            angle = target ? getRotation(dist,target.x-obj.x) : undefined,
            rotation = target ? Math.abs(angle + (obj.y>=target.y ? (target.x<obj.x ? 360 : 0) : -180)) : undefined,
            controlPath = [['M',0,0],['L',0,70],['L',70,70],['L',70,0],['L',0,0]];
            
        if(!target){
            if(obj.length!==2){
                return;
            }
            originPath = obj[0];
            destPath = obj[1];
        }else{
            originPath = createObj('path',{
                layer:'objects',
                controlledby:'all,'+(length/70)+'ft line origin#'+polyID,
                stroke:strokeColor,
                pageid:pageID,
                path:JSON.stringify([['M',0,0],['L',0,35],['L',35,35],['L',35,0],['L',0,0]]),
                top:obj.y+((rotation>270 || rotation<90) ? -70 : ((rotation<270 && rotation>90) ? 70 : 0)),
                left:obj.x+((rotation!==0 && rotation !== 180) ? 70*(angle/Math.abs(angle)) : 0),
                width:35,
                height:35,
                fill:strokeColor
            });
            destPath = createObj('path',{
                layer:'objects',
                controlledby:'all,'+(length/70)+'ft line target#'+polyID,
                stroke:strokeColor,
                pageid:pageID,
                path:JSON.stringify([['M',0,0],['L',0,35],['L',35,35],['L',35,0],['L',0,0]]),
                top:target.y,
                left:target.x,
                width:35,
                height:35,
                fill:strokeColor
            });
            toBack(originPath);
            toBack(destPath);
        }
        lineStart = {x:originPath.get('left')*1,y:originPath.get('top')*1};
        dist = pDist(lineStart,{x:destPath.get('left')*1,y:destPath.get('top')*1});
        angle = Math.round(getRotation(dist,destPath.get('left')*1-originPath.get('left')*1));
        rotation = Math.abs(angle + (originPath.get('top')*1>=destPath.get('top')*1 ? (destPath.get('left')*1<originPath.get('left')*1 ? 360 : 0) : -180));
        if(rotation % 90 ===0){
            controlPath=[['M',0,70],['L',0,0],['L',length,0],['L',length,70],['L',0,70]];
            if(rotation/90 === 2 || rotation/90===0){
                pathLength = controlPath.length;
                let pathClone = _.clone(controlPath);
                controlPath=[];
                _.each(_.range(pathLength),(r)=>{
                    controlPath.push([pathClone[r][0],pathClone[r][2],pathClone[r][1]]);
                });
            }
            let newO=createObj('path',{
                    layer:'objects',
                    controlledby:'line#'+polyID,
                    stroke:strokeColor,
                    pageid:pageID,
                    path:JSON.stringify(controlPath),
                    top:lineStart.y+(rotation === 180 ? 1 : (rotation ===0 ? -1 : 0))*(length/2 - 35),
                    left:lineStart.x+(rotation % 180!== 0 ? (0-(rotation/90 - 2))*(length/2 - 35) : 0),
                    width:(rotation % 180 !== 0 ? length : 70),
                    height:(rotation % 180 === 0 ? length : 70)
                });
        }else{
            switch(true){
                case rotation<45:
                        angleLimit = getRotation(Math.abs(pDist({x:lineStart.x- 35,y:lineStart.y + 35},{x:destPath.get('left')*1+ 35,y:destPath.get('top')*1 - 35})),Math.abs((destPath.get('top')*1- 35)-(lineStart.y + 35)));
                        break;
                    case rotation<90:
                        angleLimit = getRotation(Math.abs(pDist({x:lineStart.x- 35,y:lineStart.y + 35},{x:destPath.get('left')*1+ 35,y:destPath.get('top')*1 - 35})),Math.abs((destPath.get('left')*1+ 35)-(lineStart.x - 35)));
                        break;
                    case rotation<135:
                        angleLimit = getRotation(Math.abs(pDist({x:lineStart.x- 35,y:lineStart.y - 35},{x:destPath.get('left')*1+ 35,y:destPath.get('top')*1 + 35})),Math.abs((destPath.get('left')*1+ 35)-(lineStart.x - 35)));
                        break;
                    case rotation<180:
                        angleLimit = getRotation(Math.abs(pDist({x:lineStart.x- 35,y:lineStart.y - 35},{x:destPath.get('left')*1+ 35,y:destPath.get('top')*1 + 35})),Math.abs((destPath.get('top')*1+ 35)-(lineStart.y - 35)));
                        break;
                    case rotation<225:
                        angleLimit = getRotation(Math.abs(pDist({x:lineStart.x+ 35,y:lineStart.y - 35},{x:destPath.get('left')*1- 35,y:destPath.get('top')*1 + 35})),Math.abs((destPath.get('top')*1+ 35)-(lineStart.y - 35)));
                        break;
                    case rotation<270:
                        angleLimit = getRotation(Math.abs(pDist({x:lineStart.x+ 35,y:lineStart.y - 35},{x:destPath.get('left')*1- 35,y:destPath.get('top')*1 + 35})),Math.abs((destPath.get('left')*1- 35)-(lineStart.x + 35)));
                        break;
                    case rotation<315:
                        angleLimit = getRotation(Math.abs(pDist({x:lineStart.x+ 35,y:lineStart.y + 35},{x:destPath.get('left')*1- 35,y:destPath.get('top')*1 - 35})),Math.abs((destPath.get('left')*1- 35)-(lineStart.x + 35)));
                        break;
                    case rotation<360:
                        angleLimit = getRotation(Math.abs(pDist({x:lineStart.x+ 35,y:lineStart.y + 35},{x:destPath.get('left')*1- 35,y:destPath.get('top')*1 - 35})),Math.abs((destPath.get('top')*1- 35)-(lineStart.y + 35)));
                        break;
            }
            controlPath = [['M',0,70]];
            let paths = [];
            let origin = {x:0,y:70};
            accumulator.push({x:70,y:70});
            let flip = false;
            let lineWorker = () =>{
                try{
                    newSquare=undefined;
                square = accumulator.shift();
                controlPath.push(['L',square.x,square.y]);
                dist = pDist({x:0,y:0},square);
                angle = getRotation(dist,square.x);
                if(!flip){
                    if(angle < angleLimit){
                        newSquare = {x:square.x+ 70,y:square.y};
                    }else if(angle > angleLimit){
                        newSquare = {x:square.x- 70,y:square.y+ 70};
                        controlPath.pop();
                    }else if(angle === angleLimit){
                        newSquare = {x:square.x,y:square.y- 70};
                        flip = true;
                    }
                    if(pDist({x:0,y:0},newSquare)<=length + 35){
                        accumulator.push(newSquare);
                    }else{
                        if(controlPath[controlPath.length - 1][1] === controlPath[controlPath.length - 2][1]){
                            controlPath.pop();
                            accumulator.push({x:square.x,y:square.y - 140});
                        }else{
                            accumulator.push({x:square.x,y:square.y - 70});
                        }
                        flip = true;
                    }
                }else{
                    if(angle > angleLimit && square.x>controlPath[0][1]){
                        newSquare = {x:square.x- 70,y:square.y};
                    }else if(angle < angleLimit && square.x>controlPath[0][1]){
                        newSquare = {x:square.x+ 70,y:square.y- 70};
                        controlPath.pop();
                    }
                    if(square.x>controlPath[0][1]){
                        accumulator.push(newSquare);
                    }else{
                        flip = false;
                        controlPath.push(['L',controlPath[0][1],controlPath[0][2]]);
                        paths.push(_.clone(controlPath));
                        let newX = _.max(controlPath,(cp)=>{return cp[1]})[1];
                        let newY = _.max(controlPath,(cp)=>{return cp[2]})[2] + 70;
                        controlPath=[['M',newX,newY]];
                        newSquare = {x:newX + 70,y:newY};
                        if(pDist({x:0,y:0},newSquare)<=length+ 35){
                            accumulator.push(newSquare);
                        }
                    }
                }
                if(!_.isEmpty(accumulator)){
                    return new Promise((resolve,reject)=>{
                        _.defer(()=>{resolve(lineWorker())});
                    });
                }else{
                    return 'line created';
                }
                }catch(err){
                    sendError(err);
                }
            };
            await lineWorker();
            let allLength = paths.length;
            _.each(_.range(allLength),(p)=>{
                finalLine = [];
                width = _.max(paths[p],(d)=>{return d[1]})[1]-paths[p][0][1];
                height = _.max(paths[p],(d)=>{return d[2]})[2]-paths[p][0][2]+ 70;
                let mod2 = 0;
                switch(true){
                    case rotation<45:
                        _.each(paths[p],(pa)=>{
                            finalLine.push([pa[0],pa[2],-pa[1]]);
                        });
                        trueWidth = height;
                        trueHeight = width;
                        xMod=1;
                        yMod=-1;
                        break;
                    case rotation<90:
                        _.each(paths[p],(pa)=>{
                            finalLine.push([pa[0],pa[1],-pa[2]]);
                        });
                        trueWidth = width;
                        trueHeight = height;
                        xMod=1;            
                        yMod=-1;
                        break;
                    case rotation<135:
                        finalLine = paths[p];
                        trueWidth = width;
                        trueHeight = height;
                        xMod=1;
                        yMod=1;
                        break;
                    case rotation<180:
                        _.each(paths[p],(pa)=>{
                            finalLine.push([pa[0],pa[2],pa[1]]);
                        });
                        trueWidth = height;
                        trueHeight = width;
                        xMod=1;
                        yMod=1;
                        break;
                    case rotation<225:
                        _.each(paths[p],(pa)=>{
                            finalLine.push([pa[0],-pa[2],pa[1]]);
                        });
                        trueWidth = height;
                        trueHeight = width;
                        xMod=-1;
                        yMod=1;
                        mod2 = 1;
                        break;
                    case rotation<270:
                        _.each(paths[p],(pa)=>{
                            finalLine.push([pa[0],-pa[1],pa[2]]);
                        });
                        trueWidth = width;
                        trueHeight = height;
                        xMod=-1;
                        yMod=1;
                        break;
                    case rotation<315:
                        _.each(paths[p],(pa)=>{
                            finalLine.push([pa[0],-pa[1],-pa[2]]);
                        });
                        trueWidth = width;
                        trueHeight = height;
                        xMod=-1;
                        yMod=-1;
                        break;
                    case rotation<360:
                        _.each(paths[p],(pa)=>{
                            finalLine.push([pa[0],-pa[2],-pa[1]]);
                        });
                        trueWidth = height;
                        trueHeight = width;
                        xMod=-1;
                        yMod=-1;
                        break;
                }
                lines[p] = createObj('path',{
                    layer:'objects',
                    controlledby:'line#'+polyID,
                    stroke:strokeColor,
                    pageid:pageID,
                    path:JSON.stringify(finalLine),
                    top:lineStart.y+yMod*(trueHeight/2 - 35),
                    left:lineStart.x+xMod*(trueWidth/2 - 35),
                    width:trueWidth,
                    height:trueHeight
                });
                lineStart = {x:lines[p].get('left')+xMod*(35+lines[p].get('width')/2),y:lines[p].get('top')+yMod*(35+lines[p].get('height')/2)};
            });
        }
        }catch(err){
            sendError(err);
        }
    },
    
    pDist=function(p1,p2){ 
        return Math.sqrt(((p1.x-p2.x)**2)+((p1.y-p2.y)**2));
    },
    
    getRotation = function(h,x){
        return Math.asin(x/h)*180/Math.PI;
    },
    
    generateAOE = async function(tokens,size,shape,playerid){
        try{
            state.PFCompanion.AOETrack=[];
        var page = getObj('page',tokens[0].get('pageid')),
            strokeColor = getObj('player',playerid).get('color'),
            origin = tokens[0],
            target = tokens[1],
            polyID = generateRowID(),
            path,width,height,topMod,leftMod,left,top,size;
            
        size = size.match(/(\d+)(?:'|\s*ft)(?:\s+(radius))?/);
        if(!size){
            return;
        }
        shape = (shape==='emanation'||shape==='spread') ? 'burst' : shape;
        size = size[2] ? size[1]*2/5 : size[1]*1/5;
        switch(shape){
            //create Up, down, left, right, Up-Left, Up-right, Down-left, down-right
            case 'cone':
                [path,leftMod,topMod,width,height,shape] = await mapCone({x:origin.get('left')*1,y:origin.get('top')*1},{x:target.get('left')*1,y:target.get('top')*1},70*size);
                break;
            case 'burst':
                path = await mapBurst({x:70*size/2,y:70*size/2}, 70*size/2);
                width = size*70;
                height = size*70;
                break;
            case 'line'||'wall':
                mapLine({x:origin.get('left')*1,y:origin.get('top')*1},{x:target.get('left')*1,y:target.get('top')*1},size*70,polyID,strokeColor,page.id);
                return;
                break;
            case 'cube':
                path = [
                    ['M',0,0],
                    ['L',0,70*size],
                    ['L',70*size,70*size],
                    ['L',70*size,0],
                    ['L',0,0]
                ];
                width = 70*size;
                height = 70*size;
                break;
        }
        if(!path){
            return;
        }
        let newO = createObj('path',{
            layer:'objects',
            controlledby:'all,'+size*5+'ft '+shape+'#'+polyID,
            stroke:strokeColor,
            pageid:page.id,
            path:JSON.stringify(path),
            top:origin.get('top')*1+ (shape.startsWith('cone') ? topMod*(height/2+ 35)+(height>size*70 ? 35 : 0) :35),
            left:origin.get('left')*1+ (shape.startsWith('cone') ? leftMod*(width/2+ 35)+(width>size*70 ? 35 : 0) :35),
            width:width,
            height:height,
        });
        }catch(err){
            sendError(err);
        }
    },
    
    parseDamage = function(details,detailKeys){
        var ops = {
                '*': (a,b)=>a*b,
                '/': (a,b)=>a/b,
                '+': (a,b)=>a+b,
                '-': (a,b)=>a-b
            },
            effectTotals = {},
            opsMatch;
        _.each(detailKeys,(dk)=>{
            let effectMatch = details[dk].match(/(.*?)>(.*)/);
            if(effectMatch){
                effectMatch[2] = _.isEmpty(effectMatch[2]) ? 'untyped' : effectMatch[2].toLowerCase().trim();
                effectMatch[1] = _.isEmpty(effectMatch[1]) ? effectMatch[2] : effectMatch[1].toLowerCase().trim();
                if(opsMatch=effectMatch[1].match(/\-|\+|\/|\*/g)){
                    if(!effectMatch[1].match(/[^\d\s\-\+\*\/]/)){
                        let opMatch = effectMatch[1].replace(/\s/g,'').match(/(\d+)([\-\+\*\/])(\d+)/);
                        if(opMatch){
                            effectMatch[1]=ops[opMatch[2]](opMatch[1]*1,opMatch[3]*1);
                        }
                    }
                }
                if(effectMatch[2]===''||effectMatch[2]==='plus'){
                    effectMatch[2]='effects';
                }
                effectTotals[effectMatch[2]]=effectTotals[effectMatch[2]] || {};
                if(effectMatch[2]==='effects'){
                    effectTotals[effectMatch[2]].effects=effectTotals[effectMatch[2]].effects || [];
                    _.each(effectMatch[1].split(/\s+/),(e)=>{
                        effectTotals[effectMatch[2]].effects.push((e==='grab' ? 'grapple' : e));
                    });
                }else{
                    if(dk.match(/crit|prec/)){
                        effectTotals[effectMatch[2]].precision = effectTotals[effectMatch[2]].precision ? ((_.isNumber(effectMatch[1]*1) && _.isNumber(effectTotals[effectMatch[2]].precision*1)) ? effectMatch[1]*1+effectTotals[effectMatch[2]].precision*1 : effectTotals[effectMatch[2]].precision+', '+effectMatch[1]) : effectMatch[1]*1 ? effectMatch[1]*1 : effectMatch[1];
                    }else{
                        effectTotals[effectMatch[2]].damage = effectTotals[effectMatch[2]].damage ? ((_.isNumber(effectMatch[1]*1) && _.isNumber(effectTotals[effectMatch[2]].damage*1)) ? effectMatch[1]*1+effectTotals[effectMatch[2]].damage*1 : effectTotals[effectMatch[2]].damage+', '+effectMatch[1]) : effectMatch[1]*1 ? effectMatch[1]*1 : effectMatch[1];
                    }
                }
            }else if(dk.toLowerCase()==='effects'){
                effectTotals['effects'] = effectTotals['effects'] || {};
                effectTotals['effects'].effects=effectTotals['effects'].effects || [];
                _.each(details[dk].split(/\s+/),(e)=>{
                    effectTotals['effects'].effects.push((e==='grab' ? 'grapple' : e));
                });
            }
        });
        return effectTotals;
    },
    
    calcDamageEffects = function(effectTotals,DR,resistances,immunities,weaknesses,enhance,spellSchool){
        var DRdamageType,resistDamageType;
        _.each(_.keys(effectTotals),(ek)=>{
            effectTotals[ek].reduction=[];
            //calculate DR applicable to damage
            if(DRdamageType=ek.match(/(?:\W|^)((?:p|b|s|pierc|blud|slash|silver|evil|good|law|chaos|adamantine|cold-iron)(?=\W|ing|geon|$))/g)){
                DRdamageType = _.map(DRdamageType,(dt)=>{
                    dt = dt.match(/(?:\W|^)((?:p|b|s|pierc|blud|slash|silver|evil|good|law|chaos|adamantine|cold-iron)(?=\W|ing|geon|$))/)[1];
                    if(dt==='p'||dt==='pierc'){
                        dt='piercing';
                    }else if(dt==='b'||dt==='blud'){
                        dt='bludgeoning';
                    }else if(dt==='s'||dt==='slash'){
                        dt='slashing';
                    }
                    return dt;
                });
                _.each(DR,(d)=>{
                    if(!_.some(DRdamageType,(dt)=>{
                        if(d.type.match(/magic/)){
                            return enhance >= 1 || spellSchool;
                        }else if(d.type.match(/silver/)||d.type.match(/cold(?:-|\s*)iron/)){
                            return d.type.match(dt) || enhance >= 3;
                        }else if(d.type.match(/adamantine/)){
                            return d.type.match(dt) || enhance >= 4;
                        }else if(d.type.match(/evil|good|law|chaos/)){
                            return d.type.match(dt) || enhance >= 5;
                        }else{
                            return d.type.match(dt);
                        }
                    })){
                        effectTotals[ek].reduction.push(d.reduction);
                    }
                });
                effectTotals[ek].reduction = _.isEmpty(effectTotals[ek].reduction) ? 0 : _.max(effectTotals[ek].reduction);
            }
            //calculate resistance applicable to damage
            effectTotals[ek].resist=[];
            if(resistDamageType=ek.match(/fire|cold|elec|force|psychic|sonic|burn/g)){
                resistDamageType = _.map(resistDamageType,(dt)=>{
                    if(dt==='elec'){
                        dt='electricity';
                    }
                    if(dt==='burn'){
                        dt='fire';
                    }
                    return dt;
                });
                _.each(resistances,(r)=>{
                    if(_.some(resistDamageType,(dt)=>{return dt===r.type})){
                        effectTotals[ek].resist.push(r.resist);
                    }
                });
                effectTotals[ek].resist = _.isEmpty(effectTotals[ek].resist) ? 0 : _.max(effectTotals[ek].resist);
            }
            //calculate immunities applicable to damage/effects
            if(ek!=='effects'){
                if(_.some(immunities,(i)=>{return ek.match(i) || (spellSchool ? spellSchool.toLowerCase().match(i) : false)})){
                    effectTotals[ek].immune=true;
                }
                if(_.some(immunities,(i)=>{return i.match(/crit|prec/)})){
                    effectTotals[ek].precision=0;
                }
            }else{
                effectTotals[ek].effects = _.reject(effectTotals[ek].effects,(e)=>{return _.some(immunities,(i)=>{return (e==='grab' ? 'grapple'===i : e===i)})});
            }
            //calculate weaknesses applicable to damage/effects (Only vulnerability taken into account)
            if(_.some(weaknesses,(w)=>{return _.some(ek.split(/\/|\s+/),(e)=>{return w.match(new RegExp('vulnerab(?:le|ility)\\s+to\\s+'+((e==='p' ? 'piercing' : undefined)||(e==='b' ? 'bludgeoning' : undefined)||(e==='s' ? 'slahing' : undefined)||e)))})})){
                effectTotals[ek].vulnerable = true;
            }
            effectTotals[ek].resist = (_.isEmpty(effectTotals[ek].resist) && !_.isNumber(effectTotals[ek].resist)) ? 0 : effectTotals[ek].resist;
            effectTotals[ek].reduction = (_.isEmpty(effectTotals[ek].reduction) && !_.isNumber(effectTotals[ek].reduction)) ? 0 : effectTotals[ek].reduction;
        });
        return effectTotals;
    },
    
    flattenDR = function(DR){
        var newDR=[];
        _.each(DR,(d)=>{
            let typeMatch = d.type.match(/\s+and\s+/g);
            if(typeMatch){
                _.each(_.range(typeMatch.length),()=>{
                    let tempMatch = d.type.match(/(.*?)\s+and/);
                    if(tempMatch){
                        let temp = tempMatch[1];
                        d.type = d.type.replace(new RegExp(tempMatch[1]+'\\s+and\\s+'),'');
                        newDR.push({type:tempMatch[1].trim(),reduction:d.reduction});
                    }
                });
                newDR.push({type:d.type.trim(),reduction:d.reduction});
            }else{
                newDR.push({type:d.type.trim(),reduction:d.reduction});
            }
        });
        return newDR;
    },
    
    applyEffect = async function(token,details){
        try{
        var character = getObj('character',token.get('represents')),
            detailKeys = _.keys(details),
            effectTotals,
            mathop=0,
            bar = _.chain(_.keys(state.PFCompanion.defaultToken))
                .map((k)=>{
                    if(state.PFCompanion.defaultToken[k].toLowerCase()==='hp'){
                        let mat = k.match(/bar(\d)Link/)[1];
                        return mat;
                    }else{
                        return undefined;
                    }
                })
                .reject((k)=>{return _.isUndefined(k)})
                .find((l)=>{
                    return state.PFCompanion.defaultToken['bar'+l+'Link'].toLowerCase()==='hp'})
                .value(),
            totDamage=0,
            conditionList = ['Exhausted','Fatigued','Blinded','Entangled','Invisible','Cowering','Fear','Pinned','Dazzled','Flat-Footed','Prone','Deafened','Grappled','Sickened','Helpless','Stunned','Energy Drain'],
            opsMatch,DR,resistances,immunities,weaknesses,effectMatch,damageTotal,otherEffects,DRdamageType,resistDamageType,opMatch,attrMatch,
            rowType,enhancement,spellSchool,condition,buff,rounds,actor,hp;
            
        detailKeys = _.reject(detailKeys,(dk)=>{return details[dk]==='>'});
        if(_.isEmpty(detailKeys)||_.indexOf(detailKeys,'rid')===-1){
            return;
        }
        rowType = _.find(findObjs({type:'attribute'}),(a)=>{return a.get('name').toLowerCase().match(details.rid.toLowerCase())});
        actor = getObj('character',rowType.get('characterid'));
        rowType = rowType.get('name').match(/repeating_([^_]+)/)[1];
        if(rowType==='spells'){
            spellSchool = _.find(findObjs({type:'attribute'}),(a)=>{return a.get('name')==='repeating_spells_'+details.rid+'_school'});
            if(spellSchool){
                spellSchool = spellSchool.get('current');
            }
        }else if(rowType==='weapon'){
            enhancement = findObjs({type:'attribute',name:'repeating_weapon_'+details.rid+'_enhance'})[0];
            if(enhancement){
                enhancement = enhancement.get('current')*1;
            }
            if(spellSchool = findObjs({type:'attribute',name:'repeating_weapon_'+details.rid+'_source-spell'})[0]){
                if(!_.isEmpty(spellSchool.get('current'))){
                    spellSchool = findObjs({type:'attribute',name:'repeating_spells_'+spellSchool.get('current')+'_school'},{caseInsensitive:true})[0];
                    if(spellSchool){
                        spellSchool = spellSchool.get('current');
                    }
                }
            }
        }
        //Parse Damage
        effectTotals = parseDamage(details,detailKeys);
        //DR handling
        DR=getAttrByName(character.id,'DR');
        resistances = getAttrByName(character.id,'resistances');
        immunities = getAttrByName(character.id,'immunities');
        weaknesses = getAttrByName(character.id,'weaknesses');
        DR=_.isEmpty(DR) ? [] : _.chain(DR.match(/(\d+)\/([^\d]+)/g))
            .map((d)=>{
                if(attrMatch = d.toLowerCase().match(/(\d+)\/([^\d]+)/)){
                    return {
                        type:attrMatch[2],
                        reduction:attrMatch[1]*1
                    };
                }else{
                    return null;
                }
            })
            .reject((d)=>{return _.isEmpty(d)})
            .value();
            
        DR = flattenDR(DR);
        //Resistance Handling
        resistances = _.isEmpty(resistances) ? [] : _.chain(resistances.split(/\s*,\s*/))
            .map((r)=>{
                if(attrMatch = r.toLowerCase().match(/([^\d]+)(\d+)/)){
                    return {
                        type:attrMatch[1].trim(),
                        resist:attrMatch[2]*1
                    };
                }else{
                    return null;
                }
            })
            .reject((r)=>{return _.isEmpty(r)})
            .value();
        //Immunities handling
        immunities = _.isEmpty(immunities) ? [] : immunities.toLowerCase().split(/\s*,\s*/);
        //Weaknesses handling
        weaknesses = _.isEmpty(weaknesses) ? [] : weaknesses.toLowerCase().split(/\s*,\s*/);
        //Calculate total damage/effects
        effectTotals = calcDamageEffects(effectTotals,DR,resistances,immunities,weaknesses,enhancement,spellSchool);
        //Apply damage/effecft
        _.each(_.keys(effectTotals),(et) =>{
            if(effectTotals[et].immune){
                effectTotals[et]={};
            }
            if(et!=='effects'){
                if(_.isNumber(effectTotals[et].damage)){
                    effectTotals[et].damage = Math.max(effectTotals[et].damage+effectTotals[et].precision-(effectTotals[et].reduction+effectTotals[et].resist),0);
                }
                if(effectTotals[et].vulnerable && effectTotals[et].damage){
                    effectTotals[et].damage = Math.floor(effectTotals[et].damage*1.5);
                }
                if(effectTotals[et].damage){
                    if(et==='heal'){
                        totDamage-=effectTotals[et].damage;
                    }else{
                        totDamage+=effectTotals[et].damage;
                    }
                }
            }
        });
        if(totDamage && bar){
            if(_.some([1,2,3],(n)=>{return !_.isEmpty(token.get('bar'+n+'_link'))})){
                hp = findObjs({type:'attribute',characterid:character.id,name:'HP'})[0];
            }
            if(hp){
                if(totDamage>0){
                    let tempHP = findObjs({type:'attribute',characterid:character.id,name:'HP-temp'})[0];
                    if(tempHP){
                        let damForTemp = Math.min(totDamage,tempHP.get('current')*1);
                        totDamage = totDamage - damForTemp;
                        tempHP.set('current',tempHP.get('current')*1 - damForTemp);
                    }
                }
                let newhp = hp.get('current')*1 - totDamage;
                hp.set('current',Math.min(newhp,hp.get('max')*1));
            }else{
                token.set('bar'+bar+'_value',Math.min((token.get('bar'+bar+'_value')*1 - totDamage),token.get('bar'+bar+'_max')*1));
            }
        }
        if(effectTotals['effects']){
            let effectWorker = async () =>{
                try{
                    let effect = effectTotals['effects'].effects.shift();
                    condition = _.find(conditionList,(cl)=>{return cl.toLowerCase().match(effect)});
                    if(!condition){
                        buff = _.find(findObjs({type:'attribute',characterid:actor.id}),(a)=>{return a.get('name').match(/repeating_buff2_-[^_]+_name/) && a.get('current').toLowerCase().startsWith(effect)});
                        if(buff){
                            let newBuff = _.find(findObjs({type:'attribute',characterid:token.get('represents')}),(a)=>{return a.get('name').match(/repeating_buff2_-[^_]+_name/) && a.get('current')===buff.get('current')});
                            if(!newBuff){
                                await copyBuff(actor,character,buff.get('name').match(/repeating_buff2_(-[^_]+)_name/)[1]);
                            }
                            buff = effect
                        }
                    }
                    if(condition || buff){
                        await applyConditions(character,condition,buff);
                    }
                    if(!_.isEmpty(effectTotals['effects'].effects)){
                        return effectWorker();
                    }else{
                        return 'effects worked';
                    }
                }catch(err){
                    sendError(err);
                }
            };
            if(effectTotals['effects'] && bar){
                if(!_.isEmpty(effectTotals['effects'].effects)){
                    await new Promise((resolve,reject)=>{
                        _.defer(()=>{resolve(effectWorker())});
                    });
                }
            }
        }
        }catch(err){
            sendError(err);
        }
    },
    
    copyBuff = async function(actor,target,rowID){
        var fields = _.filter(findObjs({type:'attribute',characterid:actor.id}),(a)=>{return a.get('name').match(rowID)}),
            newID = generateRowID,
            fieldWorker = async () =>{
                let f = fields.shift();
                let attr = createObj('attribute',{
                    characterid:target.id,
                    name:f.get('name').replace(/_-[^_]+_/,'_'+newID+'_'),
                });
                let completed = new Promise((resolve,reject)=>{
                    onSheetWorkerCompleted(()=>{
                        resolve(attr);
                    });
                });
                attr.setWithWorker({current:f.get('current'),max:f.get('max')});
                await completed;
                if(!_.isEmpty(fields)){
                    return fieldWorker();
                }else{
                    return 'fields worked';
                }
            };
            
        if(!_.isEmpty(fields)){
            return fieldWorker();
        }else{
            return undefined;
        }
    },
    
    mapShape = async function(path){
        try{
            var segments = PathMath.toSegments(path),
                start = {x:~~(((segments[0][0][0]+segments[1][0][0]+segments[segments.length- 2][0][0]+segments[segments.length- 2][0][0])/4)/70)*70+ 35,y:~~(((segments[0][0][1]+segments[1][0][1]+segments[segments.length- 2][0][1]+segments[segments.length- 3][0][1])/4)/70)*70+ 35},
                xD = [-70,0,70,70,70,0,-70,-70],//relative x coordinates
                yD = [-70,-70,-70,0,70,70,70,0],//relative y coordinates
                shapeMap = {},
                accumulator = [],
                mapper = () =>{
                    try{
                        let square = accumulator.shift();
                        let sq = [square.x,square.y,1];
                        _.each(xD,(xd)=>{
                            _.each(yD,(yd)=>{
                                let newSquare = {x:square.x+xd,y:square.y+yd};
                                let nsq = [newSquare.x,newSquare.y,1];
                                if(!shapeMap[newSquare.x+'X'+newSquare.y]){
                                    if(!_.some(segments,(s)=>{return PathMath.segmentIntersection([sq,nsq],s)})){
                                        shapeMap[newSquare.x+'X'+newSquare.y]={x:newSquare.x,y:newSquare.y};
                                        accumulator.push(newSquare);
                                    }
                                }
                            });
                        });
                        if(!_.isEmpty(accumulator)){
                            return new Promise((resolve,reject)=>{
                                _.defer(()=>{resolve(mapper())});
                            });
                        }else{
                            return 'path mapped';
                        }
                    }catch(err){
                        sendError(err);
                    }
                };
            accumulator.push(start);
            shapeMap[start.x+'X'+start.y]={x:start.x,y:start.y};
            await mapper();
            return shapeMap;
        }catch(err){
            sendError(err);
        }
    },
    
    findAffected = async function(paths,details){
        try{
            var colStart,colEnd,rowStart,rowEnd,x,y,
                    objects = findObjs({
                        type: 'graphic',
                        layer: 'objects',
                        pageid: paths[0].get('pageid')
                    }),
                pathSegments,pathCenter,square,intersect,
                xD = [-1,1,1,-1],//relative x coordinates
                yD = [-1,-1,1,1],
                shapeMap = [];
            let pathWorker = async()=>{
                let p = paths.shift();
                let sMap = await mapShape(p);
                shapeMap.push(sMap);
                if(!_.isEmpty(paths)){
                    return pathWorker();
                }else{
                    return 'paths mapped';
                }
            };
            await pathWorker();
            objects = _.chain(objects)
                .reject((o)=>{return _.isEmpty(o.get('represents'))})
                .filter((o)=>{
                    return _.some(shapeMap,(shape)=>{
                        return _.some(shape,(sm)=>{
                            let squarePtPath = [[sm.x,sm.y,1],[o.get('left')*1,o.get('top')*1,1]];
                            let squarePaths = [
                                [[o.get('left')*1-Math.max(o.get('width')/2,35),o.get('top')*1-Math.max(o.get('height')/2,35),1],[o.get('left')*1+Math.max(o.get('width')/2,35),o.get('top')*1-Math.max(o.get('height')/2,35),1]],//top segment
                                [[o.get('left')*1+Math.max(o.get('width')/2,35),o.get('top')*1-Math.max(o.get('height')/2,35),1],[o.get('left')*1+Math.max(o.get('width')/2,35),o.get('top')*1+Math.max(o.get('height')/2,35),1]],//right segment
                                [[o.get('left')*1+Math.max(o.get('width')/2,35),o.get('top')*1+Math.max(o.get('height')/2,35),1],[o.get('left')*1-Math.max(o.get('width')/2,35),o.get('top')*1-Math.max(o.get('height')/2,35),1]],//bottom segment
                                [[o.get('left')*1-Math.max(o.get('width')/2,35),o.get('top')*1+Math.max(o.get('height')/2,35),1],[o.get('left')*1-Math.max(o.get('width')/2,35),o.get('top')*1-Math.max(o.get('height')/2,35),1]]//left segment
                            ];
                            let ev = !_.some(squarePaths,(sp)=>{
                                let si = PathMath.segmentIntersection(squarePtPath,sp);
                                return si;
                            });
                            return ev;
                        });
                    });
                })
                .value();
            if(!_.isEmpty(objects)){
                rollSave(objects,details);
            }
        }catch(err){
            sendError(err);
        }
    },
    
    rollSave = function(tokens,details){
        try{
            var save = details.save ? details.save.toLowerCase().match(/dc\s*(\d+)\s+(ref(?:lex)?|will|fort(?:itude)?)\s*(.*)/) : undefined,
                attrOp = {
                    'ref':'Ref',
                    'will':'Will',
                    'fort':'Fort'
                },
                nameOp = {
                    'ref':'Reflex Save',
                    'will':'Will Save',
                    'fort':'Fortitude Save'
                },
                whisperMsg = '/w gm &{template:pf_generic} {{name=',
                publicMsg = '&{template:pf_generic} {{name=',
                DC,saveType,saveEffect,character,saveAttr,saveName,roll,mod,npc,whisper,result,mook,
                actor=getObj('character',_.find(findObjs({type:'attribute'}),(a)=>{return a.get('name').match(details.rid)}).get('characterid'));
                
            if(!save || (details.damage ? details.damage.match(/heal/i) : false)){
                _.each(tokens,(t)=>{
                    npc = getAttrByName(t.get('represents'),'is_npc')==='0' ? false : true;
                    mook = _.every([1,2,3],(n)=>{
                        return _.isEmpty(t.get('bar'+n+'_link'));
                    });
                    if(state.PFCompanion.affect[(npc ? (mook ? 'mook' : 'npc') : 'pc')+'affect']==='on'){
                        applyEffect(t,details);
                    }
                });
                return;
            }
            DC = save[1];
            saveType = save[2];
            saveEffect = save[3];
            saveAttr = attrOp[saveType.match(/ref|will|fort/)[0]];
            saveName =nameOp[saveType.match(/ref|will|fort/)[0]];
            whisperMsg += saveName+'}}';
            whisperMsg=whisperMsg.replace(/{{name=/,'{{subtitle=DC: '+DC+'}} {{name=');
            publicMsg += saveName+'}}';
            publicMsg = getAttrByName(actor.id,(getAttrByName(actor.id,'is_npc')!=='0' ? 'N' : '')+'PC-whisper')==='/w gm' ? publicMsg : publicMsg.replace(/{{name=/,'{{subtitle=DC: '+DC+'}} {{name=');
            _.each(tokens,(t)=>{
                character = getObj('character',t.get('represents'));
                mook = _.every([1,2,3],(n)=>{
                    return _.isEmpty(t.get('bar'+n+'_link'));
                });
                npc = getAttrByName(character.id,'is_npc')==='0' ? false : true;
                if(state.PFCompanion.affect[(npc ? (mook ? 'mook' : 'npc') : 'pc')+'roll']==='on'){
                    roll = randomInteger(20);
                    mod = getAttrByName(character.id,saveAttr)*1;
                    whisper = getAttrByName(character.id,(npc ? 'N' : '')+'PC-whisper')==='/w gm' ? true : false;
                    result = roll+mod;
                    let specificDetails = JSON.parse(JSON.stringify(details));
                    if((result>=DC && roll>1)||roll===20){
                        if(saveEffect.match(/half\s*damage/i)){
                            let damage = specificDetails.damage.match(/(\d+)(.*)?/);
                            if(damage){
                                specificDetails.damage = Math.floor(damage[1]/2)+damage[2];
                            }
                        }
                        if(saveEffect.match(/negate/)){
                            let negate = saveEffect.match(/negates?\s+(.+)/);
                            if(negate){
                                if(negate[1].match(/damage/)){
                                    specificDetails.damage = 0;
                                    negate[1]=negate[1].replace(/\s*damage\s*/,'');
                                }
                                if(specificDetails.effects){
                                    negate[1] = negate[1].trim().split(/\s+/);
                                    _.each(negate[1],(n)=>{
                                        specificDetails.effects = specificDetails.effects.replace(new RegExp('\\s*'+n+'\\s*'),' ').trim();
                                    });
                                }
                            }else{
                                specificDetails = undefined;
                            }
                        }
                    }
                    if(specificDetails){
                        applyEffect(t,specificDetails);
                    }
                    if(whisper){
                        whisperMsg+='{{'+t.get('name')+'=[['+roll+'[d20 Roll]+'+mod+'['+saveAttr+'] '+'+1d0'+(roll<20 ? (roll===1 ? 'cf<0cs>1' : 'cf>1cs>1') : '')+'[Crit Format] ]]}}';
                    }else{
                        publicMsg += '{{'+t.get('name')+'=[['+roll+'[d20 Roll]+'+mod+'['+saveAttr+'] '+'+1d0'+(roll<20 ? (roll===1 ? 'cf<0cs>1' : 'cf>1cs>1') : '')+'[Crit Format] ]]}}';
                    }
                }else{
                    if(!npc){
                        sendChat('Pathfinder Companion','/w "'+t.get('name')+'" &{template:pf_block} {{name=Roll a '+saveAttr+' save}} {{['+saveAttr+' Save](~'+character.id+'|'+saveType.match(/ref|will|fort/)[0]+'-Save)}}')
                    }else{
                        whisperMsg+='{{'+t.get('name')+'=['+saveAttr+' Save](~'+character.id+'|NPC-'+saveType.match(/ref|will|fort/)[0]+'-Save)}}'
                    }
                }
            });
            if(whisperMsg.match(/{{name=.*?}}\s*{{/)){
                sendChat('Pathfinder Companion',whisperMsg);
            }
            if(publicMsg.match(/{{name=.*?}}\s*{{/)){
                sendChat('Pathfinder Companion',publicMsg);
            }
        }catch(err){
            sendError(err);
        }
    },
    
    //Chat Listener for responding to non-api commands
    //                  Roll20msg
    listener = function(msg,who){
        var ammo,mainAmmo,offAmmo,
            attributes,character,rollId,
            characterId=msg.content.match(/(?:{{character_id=([^}]+)}})/) ? msg.content.match(/(?:{{character_id=([^}]+)}})/)[1] : undefined;
            
        if(!characterId){
            return;
        }
        character = getObj('character',characterId);
        if(!character){
            return;
        }
        attributes = findObjs({type:'attribute',characterid:characterId});
        if(msg.rolltemplate.startsWith('pf')){
            
        }
        rollId = msg.content.match(/(?:\|\|rowid=([^\|]+)\|\|)/) ? msg.content.match(/(?:\|\|rowid=([^\|]+)\|\|)/)[1] : undefined;
        if(msg.rolltemplate==='pf_attack' && !_.isEmpty(character.get('controlledby'))&&rollId){
            ammo = msg.content.match(/(?:\|\|item=([^\s][^\|]+))/) ? msg.content.match(/(?:\|\|item=([^\s][^\|]+))/)[1] : undefined;
            mainAmmo = msg.content.match(/(?:\|\|mainitem=([^\s][^\|]+))/) ? msg.content.match(/(?:\|\|mainitem=([^\s][^\|]+))/)[1] : undefined;
            offAmmo = msg.content.match(/(?:\|\|offitem=([^\s][^\|]+))/) ? msg.content.match(/(?:\|\|offitem=([^\s][^\|]+))/)[1] : undefined;
            if(ammo || mainAmmo || offAmmo){
                handleAmmo(ammo,mainAmmo,offAmmo,attributes,character,msg,rollId);
            }
        }
        /*if(state.PFCompanion.affect.status==='on'){
            switch(msg.rolltemplate){
                case 'pf_attack':
                    affectWithAttackDialog(msg,who);
                    break;
                case 'pf_spell':
                    affectWithSpellDialog(msg,who);
                    break;
                case 'pf_ability':
                    affectWithAbilityDialog(msg,who);
                    break;
            }
        }*/
    },
    
    showHelp = function(who){
        sendChat('Pathfinder Companion','/w "'+who+'" <b><u>[Access The Quick Reference Handout](https://journal.roll20.net/handout/'+state.PFCompanion.helpLink+')</u></b><br>OR<br>'
            +"<b><u>[Read the User's Manual](https://docs.google.com/document/d/12OWJIiT8RWN6zeyZdpkl3d8_DY7XLVxbVL9QzxyJV_s/edit?usp=sharing)");
    },
    
    //create token actions for the selected character
    //                          Roll20Char Array        Array
    tokenActionMaker = function(character,toCreate,toIgnore,remove){
        var npc = getAttrByName(character.id,'is_npc')==='0' ? false : true,
            spells = getAttrByName(character.id,'use_spells'),
            abilities = findObjs({type:'ability',characterid:character.id}),
            npcAbilities = ['NPC-ability_checks','NPC-Initiative-Roll','NPC-defenses','NPC-attacks','NPC-abilities','NPC-combat_skills','NPC-skills','NPC-items','NPC-Fort-Save','NPC-Ref-Save','NPC-Will-Save'],
            pcAbilities = ['ability_checks','Roll-for-initiative','defenses','attacks','abilities','combat_skills','skills','items','Fort-Save','Ref-Save','Will-Save'],
            createKeys=['skill','skillc','checks','defense','fort','will','ref','attack','abilities','item','spellbook','initiative'],
            nameOps={
                'ability_checks':'Ability Checks',
                'defenses':'All Defenses',
                'attacks':'All Attacks',
                'abilities':'All Abilities',
                'combat_skills':'Combat Skills',
                'skills':'All Skills',
                'items':'Equipment',
                'Fort-Save':'Fortitude Save',
                'Ref-Save':'Reflex Save',
                'Will-Save':'Will Save'
            },
            spell2,spell3;
            
        toCreate = !_.isEmpty(toCreate) ? toCreate.split(/\s+/) : [];
        if(''+spells === '1'){
            state.PFCompanion.npcToCreate['spellbook']==='on' ? npcAbilities.push('NPC-spellbook-0') : undefined;
            state.PFCompanion.toCreate['spellbook']==='on' ? pcAbilities.push('spellbook-0') : undefined;
            spell2 = getAttrByName(character.id,'spellclass-1');
            spell3 = getAttrByName(character.id,'spellclass-2');
            if(spell2 && spell2!=='-1'){
                state.PFCompanion.npcToCreate['spellbook']==='on' ? npcAbilities.push('NPC-spellbook-1') : undefined
                state.PFCompanion.toCreate['spellbook']==='on' ? pcAbilities.push('spellbook-1') : undefined;
            }
            if(spell3 && spell3!=='-1'){
                state.PFCompanion.npcToCreate['spellbook']==='on' ? npcAbilities.push('NPC-spellbook-2') : undefined
                state.PFCompanion.toCreate['spellbook']==='on' ? pcAbilities.push('spellbook-2') : undefined;
            }
        }
        _.isEmpty(toCreate) ? _.each(createKeys,(ck)=>{
            state.PFCompanion[npc ? 'npcToCreate' : 'toCreate'][ck] === 'on' ? toCreate.push(ck) : undefined;
        }) : undefined;
        if(!npc){
            pcAbilities = !_.isEmpty(toCreate) ? _.filter(pcAbilities,(a)=>{return _.some(toCreate,(c)=>{return (c.toLowerCase()!=='skills' || c.toLowerCase()!=='skill') ? a.toLowerCase().indexOf(c)>-1 : (a.toLowerCase().indexOf(c)>-1 && a.toLowerCase().indexOf('combat')===-1)})}) : [];
            pcAbilities = toIgnore ? _.reject(pcAbilities,(a)=>{return _.some(toIgnore,(c)=>{return (c.toLowerCase()!=='skills' || c.toLowerCase()!=='skill') ? a.toLowerCase().indexOf(c)>-1 : (a.toLowerCase().indexOf(c)>-1 && a.toLowerCase().indexOf('combat')===-1)})}) : pcAbilities;
            _.each(abilities,(a)=>{
                if(_.some(npcAbilities,(n)=>{return a.get('description')===n})){
                    a.remove();
                }
            });
            if(remove){
                _.each(abilities,(a)=>{
                    if(_.some(pcAbilities,(n)=>{return a.get('description')===n})){
                        a.remove();
                    }
                });
                return;
            }
            _.each(pcAbilities,(a)=>{
                if(!remove && !_.some(abilities,(ab)=>{return ab.get('description')===a})){
                    createObj('ability',{
                        _characterid:character.id,
                        name:(a.indexOf('spellbook')>-1 || a.toLowerCase().indexOf('initiative')>-1) ? (a.indexOf('spellbook')>-1 ? (getAttrByName(character.id,'spellclass-'+a.replace('spellbook-','')+'-name')+' spellbook') : 'Initiative') : nameOps[a],
                        action:'%{'+character.get('name')+'|'+a+'}',
                        istokenaction:true,
                        description:a
                    });
                }
            });
        }else {
            npcAbilities = toCreate ? _.filter(npcAbilities,(a)=>{return _.some(toCreate,(c)=>{return c!=='skills' ? a.indexOf(c)>-1 : (a.indexOf(c)>-1 && a.indexOf('combat')===-1)})}) : [];
            npcAbilities = toIgnore ? _.reject(npcAbilities,(a)=>{return _.some(toIgnore,(c)=>{return c!=='skills' ? a.indexOf(c)>-1 : (a.indexOf(c)>-1 && a.indexOf('combat')===-1)})}) : npcAbilities;
            _.each(abilities,(a)=>{
                if(_.some(pcAbilities,(n)=>{return a.get('description')===n})){
                    a.remove();
                }
            });
            if(remove){
                _.each(abilities,(a)=>{
                    if(_.some(npcAbilities,(n)=>{return a.get('description')===n})){
                        a.remove();
                    }
                });
                return;
            }
            _.each(npcAbilities,(a)=>{
                if(!remove && !_.some(abilities,(ab)=>{return ab.get('description')===a})){
                    createObj('ability',{
                        _characterid:character.id,
                        name:(a.indexOf('spellbook')>-1 || a.toLowerCase().indexOf('initiative')>-1) ? (a.indexOf('spellbook')>-1 ? (getAttrByName(character.id,'spellclass-'+a.replace('NPC-spellbook-','')+'-name')+' spellbook') : 'Initiative') : nameOps[a.replace('NPC-','')],
                        action:'%{'+character.get('name')+'|'+a+'}',
                        istokenaction:true,
                        description:a
                    });
                }
            });
        }
    },
    
    tokenSetupConfig = function(menu){
        var toCheck = ['skill','skillc','checks','defense','fort','will','ref','attack','abilities','item','spellbook','initiative'],
            checkOps={
                'skill':'All Skills',
                'skillc':'Combat Skills',
                'checks':'Ability Checks',
                'defense':'Defenses',
                'fort':'Fort Save',
                'will':'Will Save',
                'ref':'Ref Save',
                'attack':'Attacks',
                'abilities':'Abilities',
                'item':'Items',
                'spellbook':'Spellbooks',
                'initiative':'Initiative'
            };
        return (!menu || menu==='TAS') ? '<div style="border-top: 1px solid #000000; border-radius: .2em; background-color: white;">'//markermsg div start
            +'<b>Automatically create token actions for macro menus:</b><br>'+(!menu ? '<span style="font-family:pictos;">'+makeButton('!pfc --config,menu=TAS','l','transparent','black','Configure auto created menus')+'</span>' : '')+'<div style="float:right;">'+makeButton('!pfc --config,TAS='+(state.PFCompanion.TAS==='auto' ? 'manual' : 'auto')+' --config'+(state.PFCompanion.TAS==='auto' ? '' : ',menu=TAS'),(state.PFCompanion.TAS==='auto' ? 'AUTO' : 'MANUAL'),(state.PFCompanion.TAS==='auto' ? 'green' : 'red'),'black','Enable or disable this automatic function. Customization of what menus to make is accessible from a submenu')+'</div><div style="clear: both"></div>'
            +((menu==='TAS' && state.PFCompanion.TAS==='auto') ? 
            '<br><table style="width:100%;text-align:center;">'
                +'<colgroup>'
                    +'<col span="3">'
                +'</colgroup>'
                
                +'<tr>'
                    +'<th></th>'
                    +'<th>PCs</th>'
                    +'<th>NPCs</th>'
                +'</tr>'
                +_.map(toCheck,(tc)=>{
                    return ('<tr>'
                        +'<td><div style="font-weight:bold;">'+checkOps[tc]+'</div></td>'
                        +'<td><div style="font-family:pictos;">'+makeButton('!pfc --config,'+tc+'='+(state.PFCompanion.toCreate[tc]==='on' ? 'off' : 'on')+' --config,menu=TAS',(state.PFCompanion.toCreate[tc]==='on' ? '3' : '_'),'transparent','black','Toggle creation of this menu on/off for PCs')+'</div></td>'
                        +'<td><div style="font-family:pictos;">'+makeButton('!pfc --config,npc'+tc+'='+(state.PFCompanion.npcToCreate[tc]==='on' ? 'off' : 'on')+' --config,menu=TAS',(state.PFCompanion.npcToCreate[tc]==='on' ? '3' : '_'),'transparent','black','Toggle creation of this menu on/off for NPCs')+'</div></td>'
                    +'</tr>')
                }).join('')
            +'</table><br>'+makeButton('!pfc --config','MAIN<br>MENU','transparent','black')+'<div style="float:right;">'+makeButton('!pfc --TAS,remove|ALL --config,'+_.map(toCheck,(tc)=>{return tc+'=off,npc'+tc+'=off'}).join(',')+' --config,menu=TAS','<u>RESET</u><br>REMOVE','#C0C0C0','#FF0000','Return to the main menu')+'</div>'
            :
            '')+'</div>' : '';
    },
    
    resourceConfig = function(menu){
        return !menu ? '<div style="border-top: 1px solid #000000; border-radius: .2em; background-color: white;">'//markermsg div start
                +'<b>Automatic Resource Tracking is:</b><div style="float:right;">'+makeButton('!pfc --config,ResourceTrack='+(state.PFCompanion.ResourceTrack==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.ResourceTrack==='on' ? 'ON' : 'OFF'),(state.PFCompanion.ResourceTrack==='on' ? 'green' : 'red'),'black','Enable/disable automatic tracking of items, abilities, and spells')+'</div><div style="clear: both"></div></div>' : '';
    },
    
    hpConfig = function(menu){
        return !menu ? '<div style="border-top: 1px solid #000000; border-radius: .2em; background-color: white;">'//markermsg div start
                +'<b>Automatically handle HP changes:</b><div style="float:right;">'+makeButton('!pfc --config,hp='+(state.PFCompanion.hp==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.hp==='on' ? 'ON' : 'OFF'),(state.PFCompanion.hp==='on' ? 'green' : 'red'),'black','Enable the limiting of increases to HP to the max value. Also will ensure temp HP is deducted before HP.')+'</div><div style="clear: both"></div></div>' : '';
    },
    
    markerConfig = function(menu){
        var conditions = ['Blinded','Entangled','Invisible','Cowering','Fear','Pinned','Dazzled','Flat-Footed','Prone','Deafened','Grappled','Sickened','Helpless','Stunned','Fatigued','Energy Drain'],
            statusQuery='|';
            
        statusQuery += statusquery.join('|')+'}';
        return (menu==='marker' || !menu) ? '<div style="border-top: 1px solid #000000; border-radius: .2em; background-color: white;">'//markermsg div start
                +'<b>Apply Condition/Buff Statusmarkers:</b><br>'+(!menu ? '<span style="font-family:pictos;">'+makeButton('!pfc --config,menu=marker','l','transparent','black','Configure condition markers')+'</span>' : '')+'<div style="float:right;">'+makeButton('!pfc --config,markers='+(state.PFCompanion.markers.markers==='on' ? 'off' : 'on')+' --config'+(state.PFCompanion.markers.markers==='on' ? '' :',menu=marker'),(state.PFCompanion.markers.markers==='on' ? 'ON' : 'OFF'),(state.PFCompanion.markers.markers==='on' ? 'green' : 'red'),'black','Apply statusmarkers based on conditions/buffs')+'</div><div style="clear: both"></div>'
                +((menu==='marker' && state.PFCompanion.markers.markers=='on') ? '<div style="padding: 0em 2em;">'
                    +_.map(conditions,(c)=>{
                        return c+'<div style="float:right;">'+makeStatusButton('!pfc --config,'+c+'='+HE('?{'+c+' status marker'+statusQuery) + ' --config,menu=marker',state.PFCompanion.markers[c],c)+'</div><div style="clear: both"></div>';
                    }).join('')
                :
                '')
                +(menu==='marker' ? '</div>'+makeButton('!pfc --config','MAIN MENU','transparent','black') : '')
                +'</div>' : '';
    },
    
    tokenConfig = function(menu){
        var linkQuery = '?{Name of attribute to link to, case insensitive. Repeating Sections not valid}';
        return !menu ? '<div style="border-top: 1px solid #000000; border-radius: .2em; background-color: white;">'//markermsg div start
                +'<b>Maintain PC Default Tokens:</b><div style="float:right;">'+makeButton('!pfc --config,defaultToken='+(state.PFCompanion.defaultToken.enable==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.defaultToken.enable==='on' ? 'ON' : 'OFF'),(state.PFCompanion.defaultToken.enable==='on' ? 'green' : 'red'),'black','Keep non-mook character'+ch("'")+'s default tokens updated when anything but bar values changes.')+'</div><div style="clear: both"></div>'
                +(state.PFCompanion.defaultToken.enable==='on' ? 
                '<table style="width:100%;table-layout:fixed;overflow:hidden;word-break:break-all;text-align:center;">'
                    +'<colgroup>'
                        +'<col span="4" style="width:25%;">'
                    +'</colgroup>'
                    +'<tr>'
                        +'<th> </th>'
                        +'<th>Bar 3</th>'
                        +'<th>Bar 1</th>'
                        +'<th>Bar 2</th>'
                    +'</tr><tr>'
                        +'<td><b>Link</b></td>'
                        +'<td>'+makeButton('!pfc --config,bar3Link='+linkQuery+' --config',(state.PFCompanion.defaultToken.bar3Link || '_'),'transparent',(state.PFCompanion.defaultToken.bar3Link ? 'black' : 'transparent'),'The name of the attribute that all tokens should either link this bar to(PCs and non-mook NPCs) or pull their starting values from (mooks)')+'</td>'
                        +'<td>'+makeButton('!pfc --config,bar1Link='+linkQuery+' --config',(state.PFCompanion.defaultToken.bar1Link || '_'),'transparent',(state.PFCompanion.defaultToken.bar1Link ? 'black' : 'transparent'),'The name of the attribute that all tokens should either link this bar to(PCs and non-mook NPCs) or pull their starting values from (mooks)')+'</td>'
                        +'<td>'+makeButton('!pfc --config,bar2Link='+linkQuery+' --config',(state.PFCompanion.defaultToken.bar2Link || '_'),'transparent',(state.PFCompanion.defaultToken.bar2Link ? 'black' : 'transparent'),'The name of the attribute that all tokens should either link this bar to(PCs and non-mook NPCs) or pull their starting values from (mooks)')+'</td>'
                    +'</tr><tr>'
                        +'<td><b>Visible</b></td>'
                        +'<td><span style="font-family:pictos;">'+makeButton('!pfc --config,bar3Visible='+(state.PFCompanion.defaultToken.bar3Visible==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.defaultToken.bar3Visible==='on' ? '3' : '_'),'transparent','black','Is this bar visible to players by default or not')+'</span></td>'
                        +'<td><span style="font-family:pictos;">'+makeButton('!pfc --config,bar1Visible='+(state.PFCompanion.defaultToken.bar1Visible==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.defaultToken.bar1Visible==='on' ? '3' : '_'),'transparent','black','Is this bar visible to players by default or not')+'</span></td>'
                        +'<td><span style="font-family:pictos;">'+makeButton('!pfc --config,bar2Visible='+(state.PFCompanion.defaultToken.bar2Visible==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.defaultToken.bar2Visible==='on' ? '3' : '_'),'transparent','black','Is this bar visible to players by default or not')+'</span></td>'
                    +'</tr>'
                +'</table>'
                :
                '')
                +'</div>' : '';
    },
    
    affectConfig = function(menu){
        return !menu ? '<div style="border-top: 1px solid #000000; border-radius: .2em; background-color: white;">'
            +'<b>Damage/Effect Listener:</b><div style="float:right;">'+makeButton('!pfc --config,status='+(state.PFCompanion.affect.status==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.affect.status==='on' ? 'ON' : 'OFF'),(state.PFCompanion.affect.status==='on' ? 'green' : 'red'),'black','Toggle listening for damage and effects of weapons, spells, and abilities.')+'</div><div style="clear: both"></div></div>'
            +(state.PFCompanion.affect.status==='on' ? 
            '<table style="width:100%;table-layout:fixed;overflow:hidden;word-break:break-all;text-align:center;">'
                    +'<colgroup>'
                        +'<col span="3" style="width:33.33%;">'
                    +'</colgroup>'
                    +'<tr>'
                        +'<th> </th>'
                        +'<th>Apply<br>Effects</th>'
                        +'<th>Roll<br>Saves</th>'
                    +'</tr><tr>'
                        +'<td><b>PCs</b></td>'
                        +'<td><span style="font-family:pictos;">'+makeButton('!pfc --config,pcaffect='+(state.PFCompanion.affect.pcaffect==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.affect.pcaffect==='on' ? '3' : '_'),'transparent','black','Automatically determine effects on PCs')+'</span></td>'
                        +'<td><span style="font-family:pictos;">'+makeButton('!pfc --config,pcroll='+(state.PFCompanion.affect.pcroll==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.affect.pcroll==='on' ? '3' : '_'),(state.PFCompanion.affect.pcaffect==='on' ? 'transparent' : '#D3D3D3'),'black','Automatically roll saves for PCs')+'</span></td>'
                    +'</tr><tr>'
                        +'<td><b>Mooks</b></td>'
                        +'<td><span style="font-family:pictos;">'+makeButton('!pfc --config,mookaffect='+(state.PFCompanion.affect.mookaffect==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.affect.mookaffect==='on' ? '3' : '_'),'transparent','black','Automatically determine effects on mooks')+'</span></td>'
                        +'<td><span style="font-family:pictos;">'+makeButton('!pfc --config,mookroll='+(state.PFCompanion.affect.mookroll==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.affect.mookroll==='on' ? '3' : '_'),(state.PFCompanion.affect.mookaffect==='on' ? 'transparent' : '#D3D3D3'),'black','Automatically roll saves for mooks')+'</span></td>'
                    +'</tr><tr>'
                        +'<td><b>Named NPCs</b></td>'
                        +'<td><span style="font-family:pictos;">'+makeButton('!pfc --config,npcaffect='+(state.PFCompanion.affect.npcaffect==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.affect.npcaffect==='on' ? '3' : '_'),'transparent','black','Automatically determine effects on npcs')+'</span></td>'
                        +'<td><span style="font-family:pictos;">'+makeButton('!pfc --config,npcroll='+(state.PFCompanion.affect.npcroll==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.affect.npcroll==='on' ? '3' : '_'),(state.PFCompanion.affect.npcaffect==='on' ? 'transparent' : '#D3D3D3'),'black','Automatically roll saves for npcs')+'</span></td>'
                    +'</tr>'
                +'</table>' : '')
            :''
    },
    
    mookConfig = function(menu){
        return !menu ? '<div style="border-top: 1px solid #000000; border-radius: .2em; background-color: white;">'//markermsg div start
                +'<b>Mook Numbering:</b><div style="float:right;">'+makeButton('!pfc --config,mook='+(state.PFCompanion.mook==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.mook==='on' ? 'ON' : 'OFF'),(state.PFCompanion.mook==='on' ? 'green' : 'red'),'black','Number mook tokens as they are placed on the VTT.')+'</div><div style="clear: both"></div></div>' : '';
    },
    
    configAssembler = function(who,menu){
        var menu = '/w "'+who+'" <div style="border: 1px solid black; background-color: white; padding: 3px 3px;">'//overall div for nice formatting of control panel
                    +'<div style="font-weight: bold; border-bottom: 1px solid black;font-size: 130%;">'//Control Panel Header div
                    +'[Pathfinder]('+mediumLogo+')<br>Companion API Script v'+version+'<b> Options</b>'
                    +'</div>'+tokenSetupConfig(menu)+resourceConfig(menu)+hpConfig(menu)+mookConfig(menu)+tokenConfig(menu)+markerConfig(menu)//+affectConfig(menu)
                    +'<div style="border-top: 1px solid #000000; border-radius: .2em; background-color: white;">'
                    +makeButton('!pfc --i','APPLY SETTINGS TO CAMPAIGN','#C0C0C0','#228B22','Reinitialize the campaign, this may take several minutes depending on campaign size.')+'</div></div>';//end Control Panel Header div
        sendChat('Pathfinder Companion',menu,null,{noarchive:true});
    },
    
    configHandler = function(who,details){
        try{
            var detailKeys = _.keys(details),
                validKeys = [,'hp','ResourceTrack','TAS','mook'],
                createKeys = [/skill$/,/skillc$/,/checks$/,/defense$/,/attack$/,/abilities$/,/item$/,/initiative$/,/spellbook$/,/fort$/,/will$/,/ref$/],
                markerKeys = ['markers','Blinded','Entangled','Invisible','Cowering','Fear','Pinned','Dazzled','Flat-Footed','Prone','Deafened','Grappled','Sickened','Helpless','Stunned'],
                tokenKeys = ['defaultToken','bar1Link','bar1Visible','bar2Link','bar2Visible','bar3Link','bar3Visible'],
                affectKeys = ['status','mookaffect','npcaffect','pcaffect','mookroll','npcroll','pcroll'],
                npc,allKeys;
                
            allKeys = validKeys.concat(markerKeys,createKeys,tokenKeys,affectKeys);
            if(!_.some(allKeys,(ak)=>{return _.some(detailKeys,(dk)=>{return (dk.match(ak))})}) || _.indexOf(detailKeys,'menu')>-1){
                configAssembler(who,details.menu);
                return;
            }
            _.each(detailKeys,(dk)=>{
                _.some(validKeys,(vk)=>{return vk===dk}) ? state.PFCompanion[dk]=details[dk] : undefined;
                _.some(createKeys,(ck)=>{
                    if(dk.match(ck)){
                        dk.match(/^npc/) ? state.PFCompanion.npcToCreate[dk.replace('npc','')] = details[dk] : state.PFCompanion.toCreate[dk] = details[dk];
                        return true;
                    }else{return false}
                });
                _.some(markerKeys,(mk)=>{
                    if(dk===mk){
                        state.PFCompanion.markers[mk]=details[mk];
                        return true;
                    }else{return false}
                });
                _.some(affectKeys,(ak)=>{
                    if(dk===ak){
                        if(ak.match(/roll/)){
                            state.PFCompanion.affect[ak]=state.PFCompanion.affect[ak.replace('roll','affect')]==='on' ? details[ak] : 'off';
                        }else if(ak.match(/affect/)){
                            state.PFCompanion.affect[ak]=details[ak];
                            if(details[ak]==='off'){
                                state.PFCompanion.affect[ak.replace('affect','roll')]='off';
                            }
                        }else{
                            state.PFCompanion.affect[ak]=details[ak];
                        }
                        return true;
                    }else{return false}
                });
                _.some(tokenKeys,(tk)=>{
                    if(dk.match(tk)){
                        dk==='defaultToken' ? state.PFCompanion.defaultToken.enable=details[tk] : (tk===dk ? state.PFCompanion.defaultToken[tk]=details[tk] : state.PFCompanion.defaultToken[tk]=undefined);
                    }
                });
            });
        }catch(err){
            sendError(err);
        }
    },
    
    HandleInput = async function(msg_orig) {
        if(!sheetCompat){
            if(msg_orig.content==='!pfcoverridecompatibility'){
                sheetCompat=true;
                sendChat('Pathfinder Companion','/w gm Compatibility check overridden. Please note that functionality is not guaranteed in this state and there may be unintended effects on sheets or the game as a whole.')
                checkInstall();
            }
            return;
        }
        try{
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
                    listener(msg,who);
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
		args = msg.content.split(/(?: )+--/);//splits the message contents into discrete arguments
		args.shift();
		let argWorker = async ()=>{
		    let a = args.shift();
            cmdDetails = cmdExtract(a);
            _.each(cmdDetails.details,(cd)=>{cd= cd==='' ? undefined : cd});
            if(cmdDetails.things.length>0){
                characters = _.chain(cmdDetails.things)
                    .map((t)=>{return getObj('character',t.trim())})
                    .reject((c)=>{return _.isUndefined(c)})
                    .value();
            }else if(msg.selected){
                characters = _.chain(msg.selected)
                    .map((s)=>{return getObj('graphic',s._id)})
                    .reject((c)=>{return _.isUndefined(c)})
                    .map((t)=>{return getObj('character',t.get('represents'))})
                    .reject((ch)=>{return _.isUndefined(ch)})
                    .value();
            }
            characters = !_.isEmpty(characters) ? characters : undefined;
            switch(cmdDetails.action){
                case 'help':
                    showHelp(who);
                    break;
                case 'i':
                    if(playerIsGM(msg.playerid)){
                        sendChat('Pathfinder Companion','/w "'+who+'" All settings being applied to campaign',null,{noarchive:true});
                        initialize(who);
                    }
                    break;
                case 'config':
                    if(playerIsGM(msg.playerid)){
                        configHandler(who,cmdDetails.details);
                    }
                    break;
                /*case 'affect':
                    var tokens = _.chain(cmdDetails.things)
                            .map((t)=>{return getObj('graphic',t)})
                            .reject((t)=>{return _.isUndefined(t)})
                            .value(),
                            replacePaths = [],
                            pageID,rPaths
                        paths = _.chain(msg.selected)
                            .map((s)=>{return(getObj('path',s._id))})
                            .reject((s)=>{return _.isUndefined(s)})
                            .reject((s)=>{
                                if(s.get('controlledby').match(/line/)){
                                    pageID = s.get('pageid');
                                    replacePaths.push(s.get('controlledby').match(/#([^,]+)/)[0]);
                                    return true;
                                }
                            })
                            .value();
                        replacePaths = _.uniq(replacePaths);
                        _.each(replacePaths,(rp)=>{
                            rPaths = _.filter(findObjs({type:'path',pageid:pageID}),(o)=>{return o.get('controlledby').match(rp) && !o.get('controlledby').match(/origin|target/)});
                        });
                        if(rPaths){
                            paths = paths.concat(rPaths);
                        }
                    if(!_.isEmpty(tokens)){
                        if(cmdDetails.details.rollSave){
                            cmdDetails.details.rollSave = undefined;
                            rollSave(tokens,cmdDetails.details);
                        }else{
                            _.each(tokens,(t)=>{
                                if(!_.isEmpty(t.get('represents'))){
                                    applyEffect(t,cmdDetails.details);
                                }
                            });
                        }
                    }else if(!_.isEmpty(paths)){
                        findAffected(paths,cmdDetails.details);
                    }
                    break;
                case 'aoe':
                    tokens = _.chain(cmdDetails.things)
                        .map((t)=>{return getObj('graphic',t)})
                        .reject((t)=>{return _.isUndefined(t)})
                        .value();
                    if(!tokens || !cmdDetails.details.size || !cmdDetails.details.shape){
                        return;
                    }
                    generateAOE(tokens,cmdDetails.details.size,cmdDetails.details.shape,msg.playerid);
                    break;*/
                case 'statuscontrol':
                    if(playerIsGM(msg.playerid) || characters[0].get('controlledby').match(msg.playerid)){
                        _.defer(statusControl,characters[0],who);
                    }
                    break;
                case 'token':
                    var token,control;
                    if(!playerIsGM(msg.playerid)){
                        _.some(msg.selected,(s)=>{
                            token = getObj('graphic',s._id);
                            if(token){
                                control = _.isEmpty(token.get('represents')) ? token.get('controlledby') : getObj('character',token.get('represents')).get('controlledby');
                                if(control.match(msg.playerid)){
                                    return true;
                                }else{
                                    token = undefined;
                                    return false;
                                }
                            }
                        });
                    }else{
                        _.some(msg.selected,(s)=>{
                            token = getObj('graphic',s._id);
                            if(token){
                                return true;
                            }else{
                                return false;
                            }
                        });
                    }
                    if(token){
                        tokenHandler(who,token,cmdDetails.details);
                    }
                    break;
                //!pfc --resource[,item=AMMONAME][,spelllevel/spellname=#/SPELLNAME][,ability=ABILITYNAME][,current=X/+/-X][,max=X/+/-X]|Character id|character id|...
                case 'resource':
                    if(characters && (cmdDetails.details.current || cmdDetails.details.max)){
                        if(cmdDetails.details.misc){
                            _.each(characters,(c)=>{
                                if(playerIsGM(msg.playerid) || c.get('controlledby').match(/all/i) || c.get('controlledby').match(msg.playerid)){
                                    handleNoteCommand(cmdDetails.details.misc,c,cmdDetails.details.current,cmdDetails.details.max);
                                }
                            });
                        }
                        if(cmdDetails.details.item){
                            _.each(characters,(c)=>{
                                if(playerIsGM(msg.playerid) || c.get('controlledby').match(/all/i) || c.get('controlledby').match(msg.playerid)){
                                handleAmmoCommand(cmdDetails.details.item,c,cmdDetails.details.current,cmdDetails.details.max);
                                }
                            });
                        }
                        if(cmdDetails.details.spell){
                            _.each(characters,(c)=>{
                                if(playerIsGM(msg.playerid) || c.get('controlledby').match(/all/i) || c.get('controlledby').match(msg.playerid)){
                                    handleSpellCommand(cmdDetails.details.spell,c,cmdDetails.details.class,cmdDetails.details.current);
                                }
                            });
                        }
                        if(cmdDetails.details.ability){
                            _.each(characters,(c)=>{
                                if(playerIsGM(msg.playerid) || c.get('controlledby').match(/all/i) || c.get('controlledby').match(msg.playerid)){
                                    handleAbilityCommand(cmdDetails.details.ability,c,cmdDetails.details.class,cmdDetails.details.current,cmdDetails.details.max);
                                }
                            });
                        }
                    }
                    break;
                case 'grouproll':
                    var tokens;
                    if(cmdDetails.details.roll && playerIsGM(msg.playerid)){
                        if(cmdDetails.details.roll.match(/init/i)){
                            if(cmdDetails.details.clear){
                                Campaign().set({turnorder:'',initiativepage:false});
                            }
                            tokens = _.chain(msg.selected)
                                .map((s)=>{
                                    return getObj('graphic',s._id);
                                })
                                .reject((s)=>{return _.isUndefined(s)})
                                .reject((s)=>{return _.isEmpty(s.get('represents'))})
                                .value();
                            tokens = _.isEmpty(tokens) ? undefined : tokens;
                        }
                        if((cmdDetails.details.roll.match(/init/i) ? !_.isEmpty(tokens) : !_.isEmpty(characters))){
                            sendGroupRoll(tokens || characters,cmdDetails.details.roll,cmdDetails.details.whisper,cmdDetails.details.sort);
                        }
                    }
                    break;
                case 'parse':
                    if(!playerIsGM(msg.playerid)){
                        return;
                    }
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
                case 'buffstatus':
                    if(characters){
                        if(playerIsGM(msg.playerid) || characters[0].get('controlledby').match(/all/i) || characters[0].get('controlledby').match(msg.playerid)){
                            buffSetup(characters[0],cmdDetails.details.buff,cmdDetails.details.markers,who);
                        }
                    }
                    break;
                case 'apply':
                    if(characters && (cmdDetails.details.condition || cmdDetails.details.buff)){
                        var defaultTokens = [],
                            mooks = [];
                            tokens = [];
                        
                        _.each(_.range(characters.length),(r)=>{
                            mooks.push(new Promise((resolve,reject)=>{
                                characters[r].get('_defaulttoken',(t)=>{
                                    if(!_.isEmpty(t)){
                                        let tok = JSON.parse(t);
                                        if(_.every([1,2,3],(n)=>{return _.isEmpty(tok['bar'+n+'_link'])})){
                                            resolve(tok.represents);
                                        }else{
                                            resolve(null);
                                        }
                                    }else{
                                        resolve(null);
                                    }
                                });
                            }));
                        });
                        mooks = await Promise.all(mooks);
                        mooks = _.chain(mooks)
                            .reject((m)=>{return _.isUndefined(m)})
                            .uniq()
                            .value();
                        tokens = _.chain(msg.selected)
                            .map((s)=>{return getObj('graphic',s._id)})
                            .reject((s)=>{return (_.isUndefined(s) || !_.some(mooks,(m)=>{return m===s.get('represents')}))})
                            .value();
                        characters = _.reject(characters,(c)=>{
                            return _.some(mooks,(m)=>{return m===c.id});
                        });
                        _.each(characters,(c)=>{
                            if(playerIsGM(msg.playerid) || c.get('controlledby').match(/all/i) || c.get('controlledby').match(msg.playerid)){
                                applyConditions(c,cmdDetails.details.condition,cmdDetails.details.buff,cmdDetails.details.swap,cmdDetails.details.remove,cmdDetails.details.rounds);
                            }
                        });
                        _.each(tokens,(t)=>{
                            applyConditions(t,cmdDetails.details.condition,cmdDetails.details.buff,cmdDetails.details.swap,cmdDetails.details.remove,cmdDetails.details.rounds);
                        })
                    }else{
                        //handling for improper command
                    }
                    break;
                case 'whisper':
                    _.each(characters,(c)=>{
                        if(playerIsGM(msg.playerid) || c.get('controlledby').match(/all/i) || c.get('controlledby').match(msg.playerid)){
                            setWhisperState(c,cmdDetails.details.pc,cmdDetails.details.npc,cmdDetails.details.stats);
                        }
                    });
                    break;
                case 'rest':
                    break;
                case 'TAS':
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
                    }else{
                        if(_.some(cmdDetails.things,(t)=>{return t==='ALL'})){
                            characters = findObjs({type:'character'});
                        }else{
                            folders = Campaign().get('journalfolder').length>0 ? JSON.parse(Campaign().get('journalfolder')) : '';
                            if(folders.length>0){
                                characters=[];
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
                    if(characters){
                        _.each(characters,(c)=>{
                            if(playerIsGM(msg.playerid) || c.get('controlledby').match(/all/i) || c.get('controlledby').match(msg.playerid)){
                                tokenActionMaker(c,cmdDetails.details.limit,cmdDetails.details.ignore,cmdDetails.details.remove);
                            }
                        });
                    }else{
                        showHelp(who);
                    }
                    break;
		    }
		    if(!_.isEmpty(args)){
		        argWorker();
		    }
		};
		if(!_.isEmpty(args)){
		    argWorker();
		}else{
		    showHelp(who);
		}
        }catch(err){
            sendError(err);
        }
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
        details = details.split(',');
        cmdSep.action = details.shift();
        _.each(details,(d)=>{
            vars=d.match(/(.*?)(?:\:|=)(.*)/) || null;
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
        try{
        if(!sheetCompat){
            return;
        }
        var npcAbilities = ['NPC-spellbook-2','NPC-spellbook-1','NPC-spellbook-0','NPC-ability_checks','NPC-initiative_Roll','NPC-defenses','NPC-attacks','NPC-abilities','NPC-combat_skills','NPC-skills','NPC-items'],
            pcAbilities = ['spellbook-2','spellbook-1','spellbook-0','ability_checks','Roll-for-initiative','defenses','attacks','abilities','combat_skills','skills','items'];
        switch(event){
            case 'add':
                (state.PFCompanion.ResourceTrack==='on' || state.PFCompanion.TAS === 'auto') ? _.defer(initializeCharacter,obj) : undefined;
                break;
            case 'change':
                if(state.PFCompanion.TAS==='auto' && obj.get('name')!==prev.name){
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
        }catch(err){
            sendError(err);
        }
    },
    
    attributeHandler = async function(obj,event,prev){
        try{
        if(!sheetCompat){
            return;
        }
        var defaultToken,barLinked;
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
                }else if(obj.get('name').toLowerCase()==='hp' && parseInt(obj.get('current'))!==parseInt(prev.current) && state.PFCompanion.hp==='on'){
                    _.defer(handleHP,obj,prev);
                }else if(obj.get('name').match(/condition-.*|repeating_buff2_[^_]+_enable_toggle/)){
                    let condName = obj.get('name').replace('condition-','');
                    let cbName = obj.get('name').match(/condition-.*/) ? state.PFCompanion.markers[(obj.get('name').replace('condition-','')==='Drained' ? 'Energy Drain' : obj.get('name').replace('condition-',''))] : getAttrByName(obj.get('characterid'),obj.get('name').replace('enable_toggle','name'));
                    let character = getObj('character',obj.get('characterid'));
                    if(!cbName){return}
                    defaultToken = await new Promise((resolve,reject)=>{
                        character.get('_defaulttoken',(t)=>{
                            if(!_.isEmpty(t)){
                                resolve(JSON.parse(t));
                            }else{
                                resolve(undefined);
                            }
                        });
                    });
                    barLinked = _.some([1,2,3],(b)=>{
                        return !_.isEmpty(defaultToken['bar'+b+'_link']);
                    });
                    if(!_.isEmpty(character.get('controlledby'))||barLinked){
                        cbName = cbName.replace(/(?:.*(?=\s+\|\|\s+))\s+\|\|\s+/,'');
                        if(cbName = statusquery[_.indexOf(statusquery,cbName)]){
                            applyStatus(character,cbName,parseInt(obj.get('current'))===0 ? false : (condName === 'Drained' ? Math.abs(parseInt(obj.get('current'))) : ((condName==='Fatigued' && parseInt(obj.get('current'))===3) ? '2' : true)));
                        }
                    }
                }
                break;
            case 'add':
                if(obj.get('name').match(/repeating_[^_]+_-[^_]+_name|repeating_[^_]+_-[^_]+_spell_level|repeating_[^_]+_-[^_]+_spellclass_number|repeating_[^_]+_-[^_]+_source-.+|repeating_[^_]+_-[^_]+_ammo/)){
                    setTimeout(()=>{
                        initializeRepeatingResourceTracking(extractRowID(obj.get('name')),findObjs({type:'attribute',characterid:obj.get('characterid')}));
                    },0);
                }else if(obj.get('name').match(/_-.+_description|_-.+_notes/)){
                    _.defer(checkForCustomTracking,obj);
                }else if(obj.get('name').match(/condition-.*|repeating_buff2_[^_]+_enable_toggle/)){
                    let cbName = obj.get('name').match(/condition-.*/) ? obj.get('name').replace('condition-','') : getAttrByName(obj.get('characterid'),obj.get('name').replace('enable_toggle','name'));
                    let character = getObj('character',obj.get('characterid'));
                    if(!cbName){return}
                    defaultToken = await new Promise((resolve,reject)=>{
                        character.get('_defaulttoken',(t)=>{
                            if(!_.isEmpty(t)){
                                resolve(JSON.parse(t));
                            }else{
                                resolve(undefined);
                            }
                        });
                    });
                    barLinked = _.some([1,2,3],(b)=>{
                        return !_.isEmpty(defaultToken['bar'+b+'_link']);
                    });
                    if(!_.isEmpty(character.get('controlledby'))||barLinked){
                        cbName = cbName.replace(/(?:.*(?=\s+\|\|\s+))\s+\|\|\s+/,'');
                        _.some(statusquery,(sq)=>{return sq.match(cbName) ? cbName=sq : false});
                        applyStatus(character,cbName,parseInt(obj.get('current'))===0 ? false : true);
                    }
                }
                break;
            case 'destroy':
                break;
        }
        }catch(err){
            sendError(err);
        }
    },
    
    campaignHandler = async function(obj,event,prev,depth){
        try{
        var oTurn=obj.get('turnorder'),
            pTurn=prev.turnorder,
            conditionMatch = /Condition: (.*)/,
            buffMatch = /Buff: (.*)/,
            nameMatch = /(.*(?= (?:Condition:|Buff:))) (?:Condition:|Buff:) /,
            newPrev=JSON.stringify(obj),
            buff,condition,character,name,removed,defaultToken,barLinked,graphic;
            
        depth = depth || 0;
        if(oTurn!==pTurn && Campaign().get('initiativepage') && !_.isEmpty(oTurn)){
            oTurn = JSON.parse(oTurn);
            pTurn = !_.isEmpty(pTurn) ? JSON.parse(pTurn) : undefined;
            if(_.isEmpty(oTurn)){
                removed = pTurn;
                if(!removed){
                    return;
                }
            }
            removed = !_.isEmpty(pTurn) ? _.reject(pTurn,(p)=>{
                return _.some(oTurn,(o)=>{
                    return p.custom===o.custom;
                });
            }) : undefined;
            removed = _.isEmpty(removed) ? undefined : removed;              
            if(removed){
                for(var i=0;i<removed.length;i++){
                    if(removed[i].custom){
                        buff = removed[i].custom.match(buffMatch) ? removed[i].custom.match(buffMatch)[1] : undefined;
                        condition = removed[i].custom.match(conditionMatch) ? removed[i].custom.match(conditionMatch)[1] : undefined;
                        name = removed[i].custom.match(nameMatch) ? removed[i].custom.match(nameMatch)[1] : undefined;
                        character = name ? _.find(findObjs({type:'character',name:name})) : undefined;
                        if(!_.isEmpty(removed[i].token)){
                            graphic=getObj('graphic',removed[i].token);
                        }
                    }
                    if((buff || condition) && character){
                        defaultToken = await new Promise((resolve,reject)=>{
                            character.get('_defaulttoken',(t)=>{
                                if(!_.isEmpty(t)){
                                    resolve(JSON.parse(t));
                                }else{
                                    resolve(undefined);
                                }
                            });
                        });
                        barLinked = _.some([1,2,3],(b)=>{
                            return !_.isEmpty(defaultToken['bar'+b+'_link']);
                        });
                        if(!_.isEmpty(character.get('controlledby'))||barLinked||graphic){
                            applyConditions(graphic||character,condition,buff,undefined,'remove');
                        }
                    }
                }
            }else{
                buff = oTurn[0].custom.match(buffMatch) ? oTurn[0].custom.match(buffMatch)[1] : undefined;
                condition = oTurn[0].custom.match(conditionMatch) ? oTurn[0].custom.match(conditionMatch)[1] : undefined;
                name = oTurn[0].custom.match(nameMatch) ? oTurn[0].custom.match(nameMatch)[1] : undefined;
                character = name ? _.find(findObjs({type:'character',name:name})) : undefined;
                if(!_.isEmpty(oTurn[0].token)){
                    graphic=getObj('graphic',oTurn[0].token);
                }
                if((buff || condition) && parseInt(oTurn[0].pr)===depth && character){
                    defaultToken = await new Promise((resolve,reject)=>{
                        character.get('_defaulttoken',(t)=>{
                            if(!_.isEmpty(t)){
                                resolve(JSON.parse(t));
                            }else{
                                resolve(undefined);
                            }
                        });
                    });
                    barLinked = _.some([1,2,3],(b)=>{
                        return !_.isEmpty(defaultToken['bar'+b+'_link']);
                    });
                    if(!_.isEmpty(character.get('controlledby'))||barLinked||graphic){
                        applyConditions(graphic||character,condition,buff,undefined,'remove');
                        campaignHandler(obj,'change',newPrev,1);
                    }
                }
            }
        } 
        }catch(err){
            sendError(err);
        }
    },
    
    mookHandler = function(token,event){
        var index;
        switch(event){
            case 'add':
                tIDs.push(token.id);
                break;
            case 'change':
                if((index =_.indexOf(tIDs,token.id))>-1){
                    if(_.every([1,2,3],(n)=>{return _.isEmpty(token.get('bar'+n+'_link'))})){
                        var tokenNames = _.chain(findObjs({type:'graphic',represents:token.get('represents'),pageid:token.get('pageid')}))
                                .reject((t)=>{return t.id===token.id})
                                .map((t)=>{return t.get('name').replace(token.get('name')+' ','')*1 || 0})
                                .reject((t)=>{return _.isNull(t)})
                                .value(),
                            number;
                        number = _.isEmpty(tokenNames) ? 1 : _.max(tokenNames)+ 1;
                        token.set('name',token.get('name')+' '+number);
                    }
                    tIDs.splice(index,1);
                }
                break;
        }
    },
    
    graphicHandler = function(obj,event,prev){
        try{
            var character,added,removed,buffMatch,conditionKeys,
                buffMarkers=[],
                conditionMarkers=[],
                updated=false,
                ignoreChange=[1,2,3],
                barLinked;
                
            if(state.PFCompanion.mook==='on'){
                mookHandler(obj,event);
            }
            if(event==='change'){
                if(!_.isEmpty(obj.get('represents')) && obj.get('left')===prev.left && obj.get('top')===prev.top){
                    if(obj.get('represents')!==prev.represents){
                        mapBars(obj,getObj('character',obj.get('represents')));
                    }else if(!_.some(ignoreChange,(i)=>{return (obj.get('bar'+i+'_value')!==prev['bar'+i+'_value'] || obj.get('bar'+i+'_max')!==prev['bar'+i+'_max'])})){
                        character = getObj('character',obj.get('represents'));
                        if(character){
                            barLinked = _.some(ignoreChange,(b)=>{
                                return !_.isEmpty(obj.get('bar'+b+'_link'));
                            });
                            if(!_.isEmpty(character.get('controlledby'))||barLinked){
                                if(obj.get('statusmarkers')!==prev.statusmarkers){
                                    removed = !_.isEmpty(prev.statusmarkers) ? _.reject(prev.statusmarkers.split(','),(p)=>{
                                        return _.some(obj.get('statusmarkers').split(','),(o)=>{
                                            return o===p;
                                        });
                                    }) : undefined;
                                    added = !_.isEmpty(obj.get('statusmarkers')) ? _.reject(obj.get('statusmarkers').split(','),(p)=>{
                                        return _.some(prev.statusmarkers.split(','),(o)=>{
                                            return o===p;
                                        });
                                    }) : undefined;
                                    _.each(findObjs({type:'attribute',characterid:character.id}),(a)=>{
                                        if(a.get('name').match(/repeating_buff2_-[^_]+_name/)){
                                            buffMatch = a.get('current').match(/(.*(?=\s+\|\|))\s+\|\|\s+(.*)/);
                                            if(buffMatch){
                                                buffMarkers.push({'name':buffMatch[1],'marker':buffMatch[2]});
                                            }
                                        }
                                    });
                                    conditionKeys = _.keys(state.PFCompanion.markers);
                                    _.each(conditionKeys,(ck)=>{
                                        conditionMarkers.push({'name':ck,'marker':state.PFCompanion.markers[ck]});
                                    });
                                    _.each(removed,(r)=>{
                                        _.each(conditionMarkers,(c)=>{
                                            if(r.match(c.marker)){
                                                updated=true;
                                                if(r.match(/@2/) && c.name==='Fatigued'){
                                                    c.name='Exhausted';
                                                }else if(r.match(/@\d/) && c.name==='Energy Drain'){
                                                    c.name='Energy Drain '+r.match(/@(\d)/)[1];
                                                }
                                                applyConditions(character,c.name,null,null,'remove');
                                            }
                                        });
                                        _.each(buffMarkers,(b)=>{
                                            if(r.match(b.marker)){
                                                updated=true;
                                                applyConditions(character,null,b.name,null,'remove');
                                            }
                                        });
                                    });
                                    _.each(added,(a)=>{
                                        _.each(conditionMarkers,(c)=>{
                                            if(a.match(c.marker)){
                                                updated=true;
                                                if(a.match(/@2/) && c.name==='Fatigued'){
                                                    c.name='Exhausted';
                                                }else if(a.match(/@\d/) && c.name==='Energy Drain'){
                                                    c.name='Energy Drain '+a.match(/@(\d)/)[1];
                                                }
                                                applyConditions(character,c.name);
                                            }
                                        });
                                        _.each(buffMarkers,(b)=>{
                                            if(a.match(b.marker)){
                                                updated=true;
                                                applyConditions(character,null,b.name);
                                            }
                                        });
                                    });
                                }
                                if(!updated){
                                    character ? setDefaultTokenForCharacter(character, obj) : undefined;
                                    updateAllTokens(character);
                                }
                            }
                        }
                    }
                }
            }
        }catch(err){
            sendError(err);
        }
    },
    
    pathHandler = function(obj,event,prev){
        if(!sheetCompat){
            return;
        }
        try{
        var shapeMatch = obj.get('controlledby').match(/(\d+)ft\s+(.*?)#([^,]+)/),
            connectedPaths,newLeft,newTop,
            strokeColor=obj.get('stroke'),
            pageID = obj.get('pageid'),
            sendPath=[];
        
        if(!shapeMatch){
            return;
        }
        switch(event){
            case 'destroy':
                if(shapeMatch[2].trim().startsWith('line')){
                    connectedPaths = _.filter(findObjs({type:'path'}),(p)=>{return p.get('controlledby').match(shapeMatch[3])});
                    _.each(connectedPaths,(p)=>{
                        p.remove();
                    });
                }
                break;
            case 'change':
                if((shapeMatch[2].startsWith('cone') && obj.get('rotation')===prev.rotation) || (shapeMatch[2].startsWith('line') && obj.get('left')===prev.left && obj.get('top')===prev.top)){
                    return;
                }
                switch(true){
                    case shapeMatch[2].match(/line (?:origin|target)/)!==null:
                        connectedPaths = _.filter(findObjs({type:'path'}),(p)=>{return p.get('controlledby').match(shapeMatch[3])});
                        _.each(connectedPaths,(p)=>{
                            if(p.get('controlledby').match(/origin/)){
                                sendPath.unshift(p);
                            }else if(p.get('controlledby').match(/target/)){
                                sendPath.push(p);
                            }else{
                                p.remove();
                            }
                        });
                        obj.set({left:(~~((obj.get('left')*1)/70))*70 + 35,top:(~~((obj.get('top')*1)/70))*70+ 35});
                        mapLine(sendPath,null,shapeMatch[1]*70,shapeMatch[3],strokeColor,pageID);
                        break;
                    case shapeMatch[2].startsWith('cone'):
                        mapCone(obj);
                        break;
                }
                break;
        }
        }catch(err){
            sendError(err);
        }
    },
    
    RegisterEventHandlers = function() {
        try{
            //message handling
            on('chat:message', HandleInput);
            
            //graphic handling
            on('change:graphic',(obj,prev)=>{graphicHandler(obj,'change',prev)});
            on('add:graphic',(obj)=>{graphicHandler(obj,'add')});
            
            //Campaign handling
            on('change:campaign:turnorder',(obj,prev)=>{campaignHandler(obj,'change',prev)});
            
            //attribute handling
            on('change:attribute',(obj,prev)=>{attributeHandler(obj,'change',prev)});
            on('add:attribute',(obj,prev)=>{attributeHandler(obj,'add',prev)});
            
            //character handling
            on('add:character',(obj,prev)=>{characterHandler(obj,'add',prev)});
            on('change:character',(obj,prev)=>{characterHandler(obj,'change',prev)});
            
            //path handling
            on('destroy:path',(obj)=>{pathHandler(obj,'destroy')});
            on('change:path',(obj,prev)=>{pathHandler(obj,'change',prev)});
            
        }catch(err){
            sendError(err);
        }
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
