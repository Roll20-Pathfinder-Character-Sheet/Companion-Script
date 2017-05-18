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

    var version = 'Prototype 0.085',
        sheetVersion = [1.53,1.52,1.51],
        lastUpdate = 1495070366,
        schemaVersion = 0.085,
        defaults = {
            css: {
                button: {
                    'border': '1px solid #cccccc',
                    'background-color': '#006dcc',
                    'margin': '0 .1em',
                    'font-weight': 'bold',
                    'padding': '.1em 1em',
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
        largeLogo = 'https://s3.amazonaws.com/files.d20.io/images/32553319/jo0tVb8t2Ru02ZoAx_2Trw/max.png?1493959120',
        mediumLogo = 'https://s3.amazonaws.com/files.d20.io/images/32553318/5tI0CxKAK5nh_C6Fb-dYuw/max.png',
        sheetCompat,

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
    
    checkInstall = function(){
        if(!_.find(findObjs({type:'attribute',name:'PFSheet_Version'}),(a)=>{return _.some(sheetVersion,(sv)=>{return ''+a.get('current')===''+sv})})){
            sendChat('Pathfinder Companion','This version of the Neceros Pathfinder Sheet Companion is only compatible with sheet version '+sheetVersion
            +'. You do not appear to be using the correct Neceros Pathfinder sheet, please switch to the appropriate sheet, or the companion script for your '
            +'sheet. The script has not initialized and will not respond to events or commands.',null,{noarchive:true});
            return;
        }
        sheetCompat=true;
        log('-=> Pathfinder Companion v'+version+' || Compatible with Sheet Version '+sheetVersion+' <=-  ['+(new Date(lastUpdate*1000))+']');
        if( ! _.has(state,'PFCompanion') || state.PFCompanion.version !== schemaVersion) {
            log('  > Updating Schema to v'+schemaVersion+' <');
            log('  > Cleaning out old resource tracking syntax <');
            cleanUpMacros();
            state.PFCompanion = state.PFCompanion || {};
            state.PFCompanion.version = schemaVersion;
            [/skill$/,/skillc$/,/checks$/,/defense$/,/attack$/,/ability$/,/item$/,/initiative$/],
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
                'Fatigued':'radioactive'
            };
            state.PFCompanion.defaultToken=state.PFCompanion.defaultToken || {};
		};
		/*if(state.PFCompanion.TAS === 'auto' || state.PFCompanion.ResourceTrack==='on'){
		    //initialize();
		}else{
		    log('  > Pathfinder Companion: No Initialization Options Enabled <');
		}*/
		generateHelp();
		buildTemplates();
	},
	
    cleanUpMacros = function(){
        var macros = _.filter(findObjs({type:'attribute'}),(a)=>{return a.get('name').match(/repeating_(?:spells|weapon|item|ability)_\-.*?(?=_)_(?:npc-)?macro-text/)}),
            macroText,outofdate,
            macroWorker;
        macroWorker = () =>{
            let m=macros.shift();
            macroText = m.get('current');
            outofdate = macroText.match(/{{.*?(?= Tracking) Tracking=.*?(?=}})}}|{{\[[^\]]+ Spell Card\]\(~[^\)]+\)=\[\*\*-\*\*\]\([^\)]+\)\[\*\*\+\*\*\]\([^\)]+\)\[\*\*\?\*\*\]\([^\)]+\)}}|{{\[[^\]]+ Description\]\(~[^\)]+\)=\[\*\*-\*\*\]\([^\)]+\)\[\*\*\+\*\*\]\([^\)]+\)\[\*\*\?\*\*\]\([^\)]+\)}}|{{Spell Tracking=\[\*\*-\*\*\]\([^\)]+\)\[\*\*\+\*\*\]\([^\)]+\)\[\*\*\?\*\*\]\([^\)]+\)}}|{{Ability Tracking=\[\*\*-\*\*\]\([^\)]+\)\[\*\*\+\*\*\]\([^\)]+\)\[\*\*\?\*\*\]\([^\)]+\)}}|{{Inventory Tracking=\[\*\*-\*\*\]\([^\)]+\)\[\*\*\+\*\*\]\([^\)]+\)\[\*\*\?\*\*\]\([^\)]+\)}}/g);
            _.each(outofdate,(ood)=>{macroText.replace(ood,'')});
            m.set('current',macroText);
            if(!_.isEmpty(macros)){
                _.defer(macroWorker);
            }else{
                log('  > Old resource tracking syntax cleaned out <');
                if(state.PFCompanion.ResourceTrack==='on'){
                    _.defer(initialize);
                }
            }
        };
        if(!_.isEmpty(macros)){
            macroWorker();
        }
    },
	
    sendError = function(err){
        var stackToSend = err.stack ? (err.stack.match(/([^\n]+\n[^\n]+)/) ? err.stack.match(/([^\n]+\n[^\n]+)/)[1].replace(/\n/g,'<br>') : 'Unable to parse error') : 'Unable to parse error';
        sendChat('PFC Error Handling','/w gm <div style="border: 1px solid black; background-color: white; padding: 3px 3px;">'//overall div for nice formatting of control panel
            +'<div style="font-weight: bold; border-bottom: 1px solid black;font-size: 130%;">'//Control Panel Header div
            +'[Pathfinder](https://s3.amazonaws.com/files.d20.io/images/32553318/5tI0CxKAK5nh_C6Fb-dYuw/max.png)<br>Companion API Script v'+version+'<b> Error Handling</b></div>'
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
    
    initialize = async function(){
        try{
        var characters;
            
        characters=findObjs({type:'character'});
        //populate macro text with appropriate ammo, ability, and spell handling syntax
        for(var i = 0;i<characters.length;i++){
            await initializeCharacter(characters[i]);
            log('  > Pathfinder Companion: '+characters[i].get('name')+' initialized <')
        }
        log('  > Pathfinder Companion: Initialization Completed <');
        }catch(err){
            sendError(err);
        }
    },
    debouncedInitialize = _.debounce(initialize,3000),
    
    initializeCharacter = function(c){
        try{
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
        }catch(err){
            sendError(err);
        }
    },
    
    initializeWeapon = function(character,macroTextObject,attributes,isNPC,rowID){
        try{
        var rollTemplate,
            spellClass,spontaneous,sourceSpellName,duplicateSpell,spellTrackingButtonField,spellDescButtonField,
            mainAmmo,offAmmo,
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
            spellClass = parseInt(getAttrByName(character.id,'repeating_spells_'+sourceSpell+'_spellclass_number'));
            spontaneous = spellClass>-1 ? (getAttrByName(character.id,'spellclass-'+spellClass+'-casting_type')==='1' ? true : false) : undefined;
            spellTrackingButtonField = spontaneous!==undefined ? ('{{spelltracking1=[**_**](!pfc --resource,spell='+sourceSpellName.get('current')+',current=-1|'+character.id+')[**&**](!pfc --resource,spell='+sourceSpellName.get('current')+',current=+1|'+character.id+')[**?**](!pfc --resource,spell='+sourceSpellName.get('current')+',current=?'+HE('{')+'Spell Adjustment}|'+character.id+')[**1**](!pfc --resource,spell='+sourceSpellName.get('current')+',current=0|'+character.id+')}}') : '';
            spellDescButtonField = '{{spelldescription1=['+sourceSpellName.get('current')+' Spell Card](~'+character.get('name')+'|'+sourceSpellName.get('name').replace('_name',(isNPC ? '_npc-roll' : '_roll'))+')}}';
            duplicateSpell = macroText.match(/{{spelldescription1=.*?(?=}})}}|{{spelltracking1=.*?(?=}})}}/g);
            duplicateSpell = duplicateSpell ? _.reject(duplicateSpell,(d)=>{return (d===spellTrackingButtonField || d===spellDescButtonField)}) : undefined;
        }
        sourceAbility = sourceAbility ? sourceAbility.get('current'):undefined;
        abilityName = sourceAbility ? _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_ability_'+sourceAbility.toLowerCase()+'_name'}) : undefined;
        if(abilityName){
            abilityUses = _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_ability_'+sourceAbility.toLowerCase()+'_hasuses'});
            abilityUses = abilityUses ? (abilityUses.get('current')==='1' ? true : false) : false;
            if(abilityUses){
                abilityTrackingButtonField = '{{abilitytracking1=[**_**](!pfc --resource,ability='+abilityName.get('current')+',current=-1|'+character.id+')[**&**](!pfc --resource,ability='+abilityName.get('current')+',current=+1|'+character.id+')[**?**](!pfc --resource,ability='+abilityName.get('current')+',current=?'+HE('{')+'Ability Adjustment}|'+character.id+')[**1**](!pfc --resource,ability='+abilityName.get('current')+',current=max|'+character.id+')}}'
                abilityDescButtonField = '{{abilitydescription1=['+abilityName.get('current')+' Description](~'+character.get('name')+'|'+abilityName.get('name').replace('_name',(isNPC ? '_npc-roll' : '_roll'))+')}}';
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
        toAdd += rollTemplate ? ((!macroText.match(/\|\|rowid=.+\|\|/) ? '||rowid='+rowID+'||' : '')
                +((macroText.indexOf(spellTrackingButtonField)===-1 && spellTrackingButtonField && spontaneous!==undefined) ? spellTrackingButtonField : '')
                +((macroText.indexOf(spellDescButtonField)===-1 && spellDescButtonField && spontaneous!==undefined) ? spellDescButtonField : '')
                +((macroText.indexOf(abilityTrackingButtonField)===-1 && abilityTrackingButtonField) ? abilityTrackingButtonField : '')
                +((macroText.indexOf(abilityDescButtonField)===-1 && abilityDescButtonField) ? abilityDescButtonField : '')
                +((!macroText.match(/\|\|item=.+\|\||\|\|mainitem=.+\|\||\|\|offitem=.+\|\|/) && usesAmmo) ? ((mainAmmo || offAmmo) ? ((mainAmmo ? '||mainitem=?{Mainhand Ammunition}||' : '')+(offAmmo ? '||offitem=?{Offhand Ammunition}||' : '')) : '||item=?{Name of Ammunition Item}||') : '')) : '';
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
        spellButtonField = spontaneous!==undefined ? ('{{spelltracking1=[**_**](!pfc --resource,spell='+spellName.get('current')+',current=-1|'+character.id+')[**&**](!pfc --resource,spell='+spellName.get('current')+',current=+1|'+character.id+')[**?**](!pfc --resource,spell='+spellName.get('current')+',current=?'+HE('{')+'Spellcasting Adjustment}|'+character.id+')[**1**](!pfc --resource,spell='+spellName.get('current')+',current=0|'+character.id+')}}') : '';
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
        var rollTemplate,duplicate,abilityButtonField,duplicate,hasUses,
            macroText = macroTextObject.get('current'),
            toAdd = '',
            abilityName = _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_ability_'+rowID.toLowerCase()+'_name'});
            
        if(!abilityName){
            return;
        }
        
        hasUses = getAttrByName(character.id,'repeating_ability_'+rowID+'_hasuses') === '1' ? true : false;
        
        abilityButtonField = '{{abilitytracking1=[**_**](!pfc --resource,ability='+abilityName.get('current')+',current=-1|'+character.id+')[**&**](!pfc --resource,ability='+abilityName.get('current')+',current=+1|'+character.id+')[**?**](!pfc --resource,ability='+abilityName.get('current')+',current=?'+HE('{')+'Ability Adjustment}|'+character.id+')[**1**](!pfc --resource,ability='+abilityName.get('current')+',current=max|'+character.id+')}}';
        duplicate = macroText.match(/{{abilitytracking1=.*?(?=}})}}/g);
        duplicate = duplicate ? _.reject(duplicate,(d)=>{return d===abilityButtonField}) : undefined;
        duplicate ? _.each(duplicate,(d)=>{macroText = macroText.replace(d,'')}) : undefined;
        toAdd = (!macroText.indexOf(abilityButtonField)>-1 && abilityButtonField && hasUses) ? abilityButtonField : '';
        rollTemplate = macroText.match(/(?:&{template:(.*)})/) ? macroText.match(/(?:&{template:([^}]+)})/)[1] : undefined;
        macroText = toAdd!=='' ? macroText.replace('&{template:'+rollTemplate+'} ','&{template:'+rollTemplate+'} '+toAdd+' ') : macroText;
        macroText!=='' ? macroTextObject.set('current',macroText) : undefined;
        }catch(err){
            sendError(err);
        }
    },
    
    initializeItem = function(character,macroTextObject,attributes,isNPC,rowID){
        try{
        var rollTemplate,duplicate,itemButtonField,
            macroText = macroTextObject.get('current'),
            toAdd = '',
            itemName = _.find(attributes,(a)=>{return a.get('name').toLowerCase()==='repeating_item_'+rowID.toLowerCase()+'_name'});
        if(!itemName){
            return;
        }
        itemButtonField = '{{itemtracking1=[**_**](!pfc --resource,item='+itemName.get('current')+',current=-1|'+character.id+')[**&**](!pfc --resource,item='+itemName.get('current')+',current=+1|'+character.id+')[**?**](!pfc --resource,item='+itemName.get('current')+',current=?'+HE('{')+itemName.get('current')+' Adjustment}|'+character.id+')[**1**](!pfc --resource,item='+itemName.get('current')+',current=max|'+character.id+')}}';
        duplicate = macroText.match(/{{itemtracking1=.*?(?=}})}}/g);
        duplicate = duplicate ? _.reject(duplicate,(d)=>{return d===itemButtonField}) : undefined;
        duplicate ? _.each(duplicate,(d)=>{macroText = macroText.replace(d,'')}) : undefined;
        rollTemplate = macroText.match(/(?:&{template:(.*)})/) ? macroText.match(/(?:&{template:([^}]+)})/)[1] : undefined;
        toAdd = (!macroText.indexOf(itemButtonField)>-1 && itemButtonField) ? itemButtonField : '';
        (toAdd || !_.isEmpty(duplicate)) ? macroTextObject.set('current',macroText.replace('&{template:'+rollTemplate+'} ','&{template:'+rollTemplate+'} '+toAdd+' ')) : undefined;
        }catch(err){
            sendError(err);
        }
    },
    
    checkForCustomTracking = function(description){
        try{
        var rowID = extractRowID(description.get('name')),
            attributes = findObjs({type:'attribute',characterid:description.get('characterid')}),
            sectionType = description.get('name').match(/weapon|spells|item|ability/) ? description.get('name').match(/weapon|spells|item|ability/)[0] : undefined,
            isNPC = getAttrByName(description.get('characterid'),'is_npc')==='0' ? false: true,
            customTrack = description.get('current').match(/\s*%%[^%]+%%\s*/),
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
            fieldNum=2,
            macroObject,macroText,currentCustomTracking,customTrackType,trackObject,customTrackField,customDescField,rollTemplate,moneyTrack;
            
        if(!customTrack){
            return;
        }
        customTrack = customTrack[0];
        description.set('current',description.get('current').replace(customTrack,'').trim());
        customTrack = customTrack.replace(/%/g,'').trim();
        trackObject = !_.some(money,(m)=>{
            if(customTrack.match(new RegExp(m,'i'))){
                trackObject = _.find(attributes,(a)=>{return a.get('name')===(customTrack.match(/other/i) ? 'other-' : '')+m.replace(/[^\|]+\|/,'')});
                return moneyTrack = true;
            }else{
                return false;
            }
        }) ? _.find(attributes,(a)=>{return a.get('current')===customTrack && a.get('name').match(/repeating_.+_-.+_name|custom[ac]\d+-name/)}) : trackObject;
        macroObject =  _.find(attributes,(a)=>{return a.get('name').toLowerCase()===description.get('name').toLowerCase().replace((sectionType==='weapon' ? 'notes' : 'description'),((isNPC && sectionType!=='ability') ? 'npc-macro-text' : 'macro-text'))});
        macroText = macroObject.get('current');
        rollTemplate = macroText.match(/&{template:[^}]+}/) ? macroText.match(/&{template:[^}]+}/)[0] : undefined;
        if(moneyTrack){
            customTrackType = trackObject ? (trackObject.get('name').match(/[CSGP]P/) ? trackObject.get('name').match(/[CSGP]P/)[0] : undefined) : undefined;
            currentCustomTracking = macroObject ? macroObject.get('current').match(new RegExp('{{miscdescription\\d='+moneyCommand[customTrackType]+'}}','i')) : undefined;
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
                customTrackField = '{{misctracking'+fieldNum+'=[**_**](!pfc --resource,misc='+(customTrack.match(/other/i) ? 'other ' : '')+customTrackType+',current=-1|'+description.get('characterid')+')[**&**](!pfc --resource,misc='+(customTrack.match(/other/i) ? 'other ' : '')+customTrackType+',current=+1|'+description.get('characterid')+')[**?**](!pfc --resource,misc='+(customTrack.match(/other/i) ? 'other ' : '')+customTrackType+',current=?'+HE('{')+customTrack+' Adjustment}|'+description.get('characterid')+')}}';
                customDescField = '{{miscdescription'+fieldNum+'='+moneyCommand[customTrackType]+'}}';
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
                customTrackField = '{{'+customTrackCommand[customTrackType]+'tracking'+fieldNum+'=[**_**](!pfc --resource,'+customTrackCommand[customTrackType]+'='+customTrack+',current=-1|'+description.get('characterid')+')[**&**](!pfc --resource,'+customTrackCommand[customTrackType]+'='+customTrack+',current=+1|'+description.get('characterid')+')[**?**](!pfc --resource,'+customTrackCommand[customTrackType]+'='+customTrack+',current=?'+HE('{')+customTrack+' Adjustment}|'+description.get('characterid')+')[**1**](!pfc --resource,'+customTrackCommand[customTrackType]+'='+customTrack+',current='+(customTrackCommand[customTrackType]==='spell' ? 0 : 'max')+'|'+description.get('characterid')+')}}';
                customDescField = '{{'+customTrackCommand[customTrackType]+'description'+fieldNum+'='+(customTrackCommand[customTrackType] === 'misc' ? customTrack : '['+customTrack+' Card](~'+trackObject.get('characterid')+'|'+trackObject.get('name').replace('name','roll')+')')+'}}';
                macroText = rollTemplate ? macroText.replace(rollTemplate,rollTemplate+' '+customTrackField+' '+customDescField) : macroText;
                macroObject.set('current',macroText);
            }else{
                sendChat('Resource Tracking','/w "'+getObj('character',description.get('characterid')).get('name')+'" There is already resource tracking handling for '+customTrack+' in the macro.');
            }
        }
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
            ammoNameAttr,rowID,ammoAttr,insufficient;
            
        ammoNameAttr = _.find(attributes,(a)=>{return a.get('name').match(/repeating_item_[^_]+_name/) && a.get('current')===ammo});
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
        }catch(err){
            sendError(err);
        }
    },
    
    handleNoteCommand = async function(note,character,changeCurrent){
        try{
        var attributes = findObjs({type:'attribute',characterid:character.id}),
            isNPC = getAttrByName(character.id,'is_npc')==='0' ? false : true,
            noteNameAttr,rowID,noteAttr,insufficient,money;
            
        if(!note.match(/[GSCP]P/)){
            noteNameAttr = _.find(attributes,(a)=>{return a.get('current')===note && a.get('name').match(/custom[ac]\d+-name/)});
            rowID = noteNameAttr ? noteNameAttr.get('name').match(/(?:custom([abc]\d+)-name)/) : undefined;
            rowID = rowID ? (!rowID[1].match(/10|11|12/) ? rowID[1] : undefined) : undefined;
            noteAttr = rowID ? _.find(attributes,(a)=>{return a.get('name')==='custom'+rowID+'-mod'}) : undefined;
            if(!noteAttr){
                return;
            }
        }else{
            money=true;
            noteAttr = _.find(attributes,(a)=>{return a.get('name').match(note.replace(/other\s+/i,'other-'))});
        }
        if(!noteAttr){
            return;
        }
        insufficient = changeCurrent ? await setResource(noteAttr,false,changeCurrent) : 0;
        insufficient = insufficient*-1;
        sendChat('Resource Tracking','@{'+character.get('name')+'|'+(!isNPC ? 'PC-whisper':'NPC-whisper')+'} &{template:pf_block} @{'+character.get('name')+'|toggle_accessible_flag} @{'+character.get('name')+'|toggle_rounded_flag} {{color=@{'+character.get('name')+'|rolltemplate_color}}} '
        +'{{subtitle='+(insufficient>0 ? ('``<b>INSUFFICIENT '+note+'</b>``<br>'+insufficient+' short') : '')+'}} {{name=Remaining '+note+'}} {{hasuses=1}} {{qty='+noteAttr.get('current')+'}} {{qty_max='+((parseInt(noteAttr.get('max'))>0 && noteAttr.get('max')!=='') ? noteAttr.get('max') : '-')+'}}'
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
            attackNames = msg.content.match(/attack\dname*=([^}]+)\d+}}/g);
            _.each(attackNames,(n)=>{
                mainUsed += n.match(/attack\dname*=([^}]+)\d+}}/)[1].trim()===mainName.trim() ? 1 : 0;
                mainUsed += n.match(/manyshot/i) ? 2 : 0;
                offUsed += n.match(/attack\dname*=([^}]+)\d+}}/)[1].trim()===offName.trim() ? 1 : 0;
            });
            if(!(mainUsed || offUsed)){
                return;
            }
            
            mainInsuf = mainUsed ? mainUsed-mainCount.get('current') : undefined;
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
        }catch(err){
            sendError(err);
        }
    },
    
    handleHP = function(obj,prev){
        try{
        var character = getObj('character',obj.get('characterid')),
            attributes = findObjs({type:'attribute',characterid:obj.get('characterid')}),
            hpDifference,
            tempHP,hpForTemp,hpForHP,objCurr,objMax;
            
        switch(obj.get('name')){
            case 'HP':
                objCurr = (''+obj.get('current')).match(/^(?:\+|\-)?\d+$/) ? parseInt(obj.get('current')) : ((''+obj.get('current')).match(/(?:\+|\-)?\d+/) ? parseInt((''+obj.get('current')).match(/(?:\+|\-)?\d+/)[0]) : undefined);
                objMax = (''+obj.get('max')).match(/^(?:\+|\-)?\d+$/) ? parseInt(obj.get('max')) : ((''+obj.get('max')).match(/(?:\+|\-)?\d+/) ? parseInt((''+obj.get('max')).match(/(?:\+|\-)?\d+/)[0]) : undefined);
                if(!objCurr && !objMax){
                    return;
                }
                hpDifference = parseInt(prev.current) - objCurr;
                if(hpDifference<=0){
                    log('difference');
                    if(objCurr>objMax){
                        obj.set('current',objMax);
                    }
                }else{
                    tempHP = _.find(attributes,(a)=>{return a.get('name')==='HP-temp'});
                    if(tempHP){
                        hpForTemp = parseInt(tempHP.get('current'))>0 ? Math.min(hpDifference,parseInt(tempHP.get('current'))) : 0;
                        tempHP.set('current',parseInt(tempHP.get('current'))-hpForTemp);
                        obj.set('current',objCurr+hpForTemp);
                    }
                }
                break;  
        }
        }catch(err){
            sendError(err);
        }
    },
    
    buffSetup = function(character,buff,marker,who){
        var msg = '/w "'+who+'" <div style="border: 1px solid black; background-color: white; padding: 3px 3px;">'//overall div for nice formatting of control panel
            +'<div style="font-weight: bold; border-bottom: 1px solid black;font-size: 130%;">'//Control Panel Header div
            +'[Pathfinder](https://s3.amazonaws.com/files.d20.io/images/32553318/5tI0CxKAK5nh_C6Fb-dYuw/max.png)<br>Companion API Script v'+version
            +'<b> Buff Status Selector</b></div>',
            currBuffs = _.filter(findObjs({type:'attribute',characterid:character.id}),(a)=>{return a.get('name').match(/repeating_buff_-[^_]+_buff-name/)}),
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
                msg+=makeButton('!pfc --buffstatus,buff='+buffName,buffName,'transparent','black');
            });
        }
        msg+='</div>';
        sendChat('Pathfinder Companion',msg,null,{noarchive:true});
    },
    
    applyConditions = async function(character,condition,buff,swap,remove,rounds){
        try{
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
            conditionNameArr = ['Fatigued','Blinded','Entangled','Invisible','Cowering','Fear','Pinned','Dazzled','Flat-Footed','Prone','Deafened','Grappled','Sickened','Helpless','Stunned'],
            conditionAttributes,conditionAttr,conditionName,
            buffAttr,buffNameAttr,buffMatch,buffStatus,
            toSet,graphic,
            turnTracker,turnOrder,conditionTrackName,buffTrackName,conditionObject,buffObject,buffIndex,conditionIndex,conditionState,buffState;
            
        if(condition){
            conditionName = condition.match(/exhaust|fatigue/i) ? 'fatigue' : condition;
            conditionName = _.find(conditionNameArr,(cn)=>{return cn.match(new RegExp(conditionName,'i'))});
            if(!conditionName){
                //handling for invalid condition name
                return;
            }
            conditionAttributes = _.filter(attributes,(a)=>{return a.get('name').match(/condition-/)});
            toSet = condition.match(/exhaust/i) ? '3' : (condition.match(/fatigue/i) ? '1' : convertValue[conditionName]);
            conditionAttr = getAttrByName(character.id,'condition-'+conditionName);
            conditionState = (swap ? ''+(parseInt(swapper[conditionAttr])*parseInt(toSet)) : (remove ? '0' : toSet));
            await createAttrWithWorker('condition-'+conditionName,character.id,conditionAttributes,conditionState);
            if(state.PFCompanion.defaultToken.enable==='on' && !_.isEmpty(character.get('controlledby'))){
                graphic = findObjs({type:'graphic',represents:character.id})[0];
                if(graphic){
                    graphic.set('status_'+state.PFCompanion.markers[conditionName],parseInt(conditionState)===0 ? false : (condition.match(/exha/i) ? 2 : true));
                    updateAllTokens(character,graphic);
                }
            }
        }
        if(buff){
            buffNameAttr = buff ? _.find(attributes,(a)=>{return a.get('name').match(/repeating_buff_-[^_]+_buff-name/) && a.get('current').toLowerCase().match(buff.toLowerCase())}) : undefined;
            buffAttr=getAttrByName(character.id,buffNameAttr.get('name').replace('buff-name','buff-enable_toggle'));
            buffState = (swap ? swapper[buffAttr+''] : (remove ? '0' : '1'));
            buffNameAttr ? createAttrWithWorker(buffNameAttr.get('name').replace('buff-name','buff-enable_toggle'),character.id,attributes,buffState) : undefined;
            buffMatch = buffNameAttr.get('current').match(/(.*(?=\s+\|\|\s+))\s+\|\|\s+(.*)/);
            if(state.PFCompanion.defaultToken.enable==='on' && !_.isEmpty(character.get('controlledby')) && buffMatch){
                graphic = findObjs({type:'graphic',represents:character.id})[0];
                if(graphic){
                    _.some(statusquery,(sq)=>{return sq.match(buffMatch[2]) ? buffStatus=sq : false}) ? graphic.set('status_'+buffStatus,parseInt(buffState)===0 ? false : true) : undefined;
                    updateAllTokens(character,graphic);
                }
            }
        }
        if(rounds || remove){
            rounds = rounds || 0;
            turnTracker =Campaign().get('initiativepage');
            if(turnTracker){
                turnOrder = Campaign().get('turnorder');
                turnOrder = !_.isEmpty(turnOrder) ? JSON.parse(turnOrder) : [];
                if(conditionName){
                    conditionTrackName = character.get('name')+' Condition: '+conditionName;
                    _.some(_.range(turnOrder.length),(r)=>{
                        if(turnOrder[r].custom===conditionTrackName && turnOrder[r].id==='-1'){
                            conditionIndex = r;
                            return true;
                        }else{return false}
                    });
                    conditionObject = conditionIndex ? _.clone(turnOrder[conditionIndex]) : {'id':'-1','custom':conditionTrackName,'formula':'-1'};
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
                    buffObject = buffIndex ? _.clone(turnOrder[buffIndex]) : {'id':'-1','custom':buffTrackName,'formula':'-1'};
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
    
    mapBars = function(graphic,character){
        try{
        var bars = {},
            attributes = findObjs({type:'attribute',characterid:character.id}),
            bar1Attr,bar2Attr,bar3Attr;
            
        if(state.PFCompanion.defaultToken.bar1Link){
            bar1Attr = _.find(attributes,(a)=>{return a.get('name').toLowerCase() === state.PFCompanion.defaultToken.bar1Link.toLowerCase()});
            if(bar1Attr){
                graphic.set({bar1_link:bar1Attr.id,bar1_value:bar1Attr.get('current'),bar1_max:(bar1Attr.get('max')!=='0' ? bar1Attr.get('max') : '')});
            }
        }
        if(state.PFCompanion.defaultToken.bar2Link){
            bar2Attr = _.find(attributes,(a)=>{return a.get('name').toLowerCase() === state.PFCompanion.defaultToken.bar2Link.toLowerCase()});
            if(bar2Attr){
                graphic.set({bar2_link:bar2Attr.id,bar2_value:bar2Attr.get('current'),bar2_max:(bar2Attr.get('max')!=='0' ? bar2Attr.get('max') : '')});
            }
        }
        if(state.PFCompanion.defaultToken.bar3Link){
            bar3Attr = _.find(attributes,(a)=>{return a.get('name').toLowerCase() === state.PFCompanion.defaultToken.bar3Link.toLowerCase()});
            if(bar3Attr){
                graphic.set({bar3_link:bar3Attr.id,bar1_value:bar3Attr.get('current'),bar3_max:(bar3Attr.get('max')!=='0' ? bar3Attr.get('max') : '')});
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
                    tok.set(_.defaults({left:tok.get('left'),top:tok.get('top')},defaultToken));
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
    
    sendGroupRoll = function(characters,roll,whisper){
        var rollName,
            rollMsg = '&{template:pf_generic} {{name=',
            attrOp = {
                'fort':'Fort','ref':'Ref','will':'Will','acrobatics':'Acrobatics','appraise':'Appraise','bluff':'Bluff','climb':'Climb','craft':'Craft',
                'diplomacy':'Diplomacy','disable device':'Disable-Device','disguise':'Disguise','escape artist':'Escape-Artist','fly':'Fly',
                'handle animal':'Handle-Animal','heal':'Heal','intimidate':'Intimidate','arcana':'Knowledge-Arcana','dungeoneering':'Knowledge-dungeoneering',
                'engineering':'Knowledge-Engineering','geography':'Knowledge-Geography','history':'Knowledge-History','local':'Knowledge-Local',
                'nature':'Knowledge-Nobility','nobility':'Knowledge-Nobility','planes':'Knowledge-Planes','religion':'Knowledge-Religion',
                'linguistics':'Linguistics','perception':'Perception','perform':'Perform','profession':'Profession','ride':'Ride','sense motive':'Sense-Motive',
                'sleight of hand':'Sleight-of-Hand','stealth':'Stealth','survival':'Survival','swim':'Swim','use magic device':'Use-Magic-Device',
                'misc':'Misc-Skill-0'
            },
            nameOp = {
                'fort':'Fortitude Save','ref':'Reflex Save','will':'Will Save','acrobatics':'Acrobatics','appraise':'Appraise','bluff':'Bluff','climb':'Climb','craft':'Craft',
                'diplomacy':'Diplomacy','disable device':'Disable Device','disguise':'Disguise','escape artist':'Escape Artist','fly':'Fly',
                'handle animal':'Handle Animal','heal':'Heal','intimidate':'Intimidate','arcana':'Knowledge (Arcana)','dungeoneering':'Knowledge (dungeoneering)',
                'engineering':'Knowledge (Engineering)','geography':'Knowledge (Geography)','history':'Knowledge (History)','local':'Knowledge (Local)',
                'nature':'Knowledge (Nobility)','nobility':'Knowledge (Nobility)','planes':'Knowledge (Planes)','religion':'Knowledge (Religion)',
                'linguistics':'Linguistics','perception':'Perception','perform':'Perform','profession':'Profession','ride':'Ride','sense motive':'Sense Motive',
                'sleight of hand':'Sleight of Hand','stealth':'Stealth','survival':'Survival','swim':'Swim','use magic device':'Use Magic Device',
                'misc':'Misc-Skill-0'
            };
            
        rollName = roll.toLowerCase().match(/fort|ref|will|acrobatics|appraise|bluff|climb|craft|diplomacy|disable device|disguise|escape artist|fly|handle animal|heal|intimidate|arcana|dungeoneering|engineering|geography|history|local|nobility|planes|religion|linguistics|perception|perform|profession|ride|sense motive|sleight of hand|stealth|survival|swim|use magic device|misc/);
        rollName = rollName ? rollName[0] : undefined;
        if(!rollName){
            //handling for unsupported roll
            return;
        }
        rollMsg += nameOp[rollName]+'}}';
        characters = characters ? characters : _.filter(findObjs({type:'character'}),(c)=>{return !_.isEmpty(c.get('controlledby'))});
        _.each(characters,(c)=>{
            rollMsg += '{{['+c.get('name')+'](https://journal.roll20.net/character/'+c.id+')=[[1d20 + @{'+c.get('name')+'|'+attrOp[rollName]+'}]] }}'
        });
        sendChat('PF Group Roll',(whisper ? '/w gm ' : '')+rollMsg);
    },
    
    statblockHandler = async function(text,characters,who){
        try{
        var block,iChar,blockSection,attributes,accrue,attributesToSet,description,setAttr,attrWorker,section,keys,parser,parseSection,statBlock,keyWorker,usesSpells,charListLength,
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
            offenseMatch=/OFFENSE\n+Speed\s+([^\n]+)\n+(?:Melee\s+([^\n]+)(?:\n+)?)?(?:Ranged\s+([^\n]+)(?:\n+)?)?(?:Space\s+([^;]+);)?(?:\s+Reach\s+([^\n]+)(?:\n+)?)?(?:Special Attacks\s+([^\n]+))?(?:\n+)?(?:((?:Spell-Like Abilities|Psychic Magic|(?:[^\s\n]+\s+)?Spells Prepared|(?:[^\s\n]+\s+)?Spells Known)\s+.+\n+(?:.+\n+)+))?/,
            tacticsMatch=/(TACTICS\n+.+\n+(?:.+(?:\n+)?)+)/,
            statisticsMatch=/STATISTICS\n+Str\s+([^,]+),\s+Dex\s+([^,]+),\s+Con\s+([^,]+),\s+Int\s+([^,]+),\s+Wis\s+([^,]+),\s+Cha\s+([^\n]+)\n+Base Atk\s+(\+\d+);\s+CMB\s+([^;]+);\s+CMD\s+([^\n]+)(?:\n+)?(?:Feats\s+([^\n]+)(?:\n+)?)?(?:Skills\s+([^\n;]+)(?:;\s+Racial Modifiers\s+([^\n]+))?)?(?:\n+)?(?:Languages\s+([^\n]+))?(?:\n+)?(?:SQ\s+([^\n]+))?(?:\n+)?((?:Combat Gear|Other Gear)\s+[^;\n]+|Gear\n(?:.*(?:\n+)?)+)?(?:;)?(Other Gear\s+[^;\n]+)?(?:\n+)?(.*$)?/,
            saMatch=/((?:SPECIAL ABILITIES)\n+(?:.*(?:\n+)?)+)/,
            ecologyMatch=/((?:ECOLOGY)\n+(?:.*(?:\n+)?)+)/,
            defaultMatch=/(?:Avatar\s+([^\n]+)\n+)?(?:Token\s+([^\n]+)\n+)?(?:([^\n]+)\n+)?([^\t]+)(?:\s+)?CR\s+([^\n]+)\n+XP\s+([^\n]+)\n+(?:([\w\s]+\d+)\n+)?(LG|NG|CG|LN|N|CN|LE|NE|CE)\s+(Fine|Diminutive|Tiny|Small|Medium|Large|Huge|Gargantuan|Colossal)\s+([\w\s]+)(?:\s+(\([\w\s,]+\)))?\n+Init\s+([^;]+);\s+Senses\s+([^;]+;\s+Perception\s+[^\n]+)(?:\n+)?(?:Weakness\s+([^\n]+)\n+)?(?:Aura\s+([^\n]+)\n+)?/,
            gearMatch=/((?:GEAR)\n+(?:.*(?:\n+)?)+)/,
            descriptionMatch = /LONG DESCRIPTION\n+((?:.+|\n+)+)/,
            charList=[],
            start = _.now();
            
        text =_.chain(text.replace(/<br\/>/g,'').replace(/<br>/g,'\n').split(/(?:\n+)?NEW CREATURE(?:\n+)?/))
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
                                usesSpells=true
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
            if(!_.isEmpty(attributesToSet['character_description'])){
                setAttr = _.find(attributes,(a)=>{return a.get('name')==='character_description'});
                setAttr ? setAttr.set('current',attributesToSet['character_description']) : attributes.push(createObj('attribute',{characterid:iChar.id,name:'character_description',current:attributesToSet['character_description']}));
            }
            if(usesSpells){
                await new Promise((resolve,reject)=>{
                    _.defer((iC,w)=>{
                        log('  > Pathfinder Companion Statblock Parser:'+iC.get('name')+' imported <');
                        sendChat('Pathfinder Companion Statblock Parser','/w "'+w+'" '+iC.get('name')+' imported',null,{noarchive:true});
                        resolve('notification sent');
                    },iChar,who);
                });
            }else{
                log('  > Pathfinder Companion Statblock Parser:'+iChar.get('name')+' imported <');
                sendChat('Pathfinder Companion Statblock Parser','/w "'+who+'" '+iChar.get('name')+' imported',null,{noarchive:true});
            }
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
            if(curr && mx){
                attribute.setWithWorker({current:curr,max:mx});
            }else if(curr || mx){
                attribute.setWithWorker((mx ? 'max' : 'current'),(mx ? mx : curr));
            }
            return retValue;
        }catch(err){
            sendError(err);
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
        if(!character){
            return;
        }
        attributes = findObjs({type:'attribute',characterid:characterId});
        rollId = msg.content.match(/(?:\|\|rowid=([^\|]+)\|\|)/) ? msg.content.match(/(?:\|\|rowid=([^\|]+)\|\|)/)[1] : undefined;
        if(!rollId){
            return;
        }
        if(msg.rolltemplate==='pf_attack' && !_.isEmpty(character.get('controlledby'))){
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
    
    //create token actions for the selected character
    //                          Roll20Char Array        Array
    tokenActionMaker = function(character,toCreate,toIgnore){
        var npc = getAttrByName(character.id,'is_npc')==='0' ? false : true,
            spells = getAttrByName(character.id,'use_spells'),
            abilities = findObjs({type:'ability',characterid:character.id}),
            npcAbilities = ['NPC-ability_checks','NPC-Initiative-Roll','NPC-defenses','NPC-attacks','NPC-abilities','NPC-combat_skills','NPC-skills','NPC-items','NPC-Fort-Save','NPC-Ref-Save','NPC-Will-Save'],
            pcAbilities = ['ability_checks','Roll-for-initiative','defenses','attacks','abilities','combat_skills','skills','items','Fort-Save','Ref-Save','Will-Save'],
            createKeys=['skill','skillc','checks','defense','fort','will','ref','attack','ability','item','spellbook','initiative'],
            spell2,spell3;
            
        toCreate = toCreate || [];
        if(spells === '1'){
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
        toIgnore = toIgnore ? toIgnore : undefined;
        if(!npc){
            pcAbilities = !_.isEmpty(toCreate) ? _.filter(pcAbilities,(a)=>{return _.some(toCreate,(c)=>{return (c.toLowerCase()!=='skills' || c.toLowerCase()!=='skill') ? a.toLowerCase().indexOf(c)>-1 : (a.toLowerCase().indexOf(c)>-1 && a.toLowerCase().indexOf('combat')===-1)})}) : [];
            pcAbilities = toIgnore ? _.reject(pcAbilities,(a)=>{return _.some(toIgnore,(c)=>{return (c.toLowerCase()!=='skills' || c.toLowerCase()!=='skill') ? a.toLowerCase().indexOf(c)>-1 : (a.toLowerCase().indexOf(c)>-1 && a.toLowerCase().indexOf('combat')===-1)})}) : pcAbilities;
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
            npcAbilities = toCreate ? _.filter(npcAbilities,(a)=>{return _.some(toCreate,(c)=>{return c!=='skills' ? a.indexOf(c)>-1 : (a.indexOf(c)>-1 && a.indexOf('combat')===-1)})}) : [];
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
    
    tokenSetupConfig = function(){
        var toCheck = ['skill','skillc','checks','defense','fort','will','ref','attack','ability','item','spellbook','initiative'],
            checkOps={
                'skill':'All Skills',
                'skillc':'Combat Skills',
                'checks':'Ability Checks',
                'defense':'Defenses',
                'fort':'Fort Save',
                'will':'Will Save',
                'ref':'Ref Save',
                'attack':'Attacks',
                'ability':'Abilities',
                'item':'Items',
                'spellbook':'Spellbooks',
                'initiative':'Initiative'
            };
        return '<div style="border-top: 1px solid #000000; border-radius: .2em; background-color: white;">'//markermsg div start
            +'<b>Automatically create token actions for macro menus:</b><div style="float:right;">'+makeButton('!pfc --config,TAS='+(state.PFCompanion.TAS==='auto' ? 'manual' : 'auto')+' --config',(state.PFCompanion.TAS==='auto' ? 'AUTO' : 'MANUAL'),(state.PFCompanion.TAS==='auto' ? 'green' : 'red'),'black')+'</div><div style="clear: both"></div>'
            +(state.PFCompanion.TAS==='auto' ? 
            '<br><table style="width:100%;">'
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
                        +'<td><div style="font-family:pictos;">'+makeButton('!pfc --config,'+tc+'='+(state.PFCompanion.toCreate[tc]==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.toCreate[tc]==='on' ? '3' : '_'),'transparent','black')+'</div></td>'
                        +'<td><div style="font-family:pictos;">'+makeButton('!pfc --config,npc'+tc+'='+(state.PFCompanion.npcToCreate[tc]==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.npcToCreate[tc]==='on' ? '3' : '_'),'transparent','black')+'</div></td>'
                    +'</tr>')
                }).join('')
            +'</table><br>'
            :
            '')+'</div>';
    },
    
    resourceConfig = function(){
        return '<div style="border-top: 1px solid #000000; border-radius: .2em; background-color: white;">'//markermsg div start
                +'<b>Automatic Resource Tracking is:</b><div style="float:right;">'+makeButton('!pfc --config,ResourceTrack='+(state.PFCompanion.ResourceTrack==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.ResourceTrack==='on' ? 'ON' : 'OFF'),(state.PFCompanion.ResourceTrack==='on' ? 'green' : 'red'),'black')+'</div><div style="clear: both"></div></div>';
    },
    
    hpConfig = function(){
        return '<div style="border-top: 1px solid #000000; border-radius: .2em; background-color: white;">'//markermsg div start
                +'<b>Automatically handle HP changes:</b><div style="float:right;">'+makeButton('!pfc --config,hp='+(state.PFCompanion.hp==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.hp==='on' ? 'ON' : 'OFF'),(state.PFCompanion.hp==='on' ? 'green' : 'red'),'black')+'</div><div style="clear: both"></div></div>';
    },
    
    markerConfig = function(){
        var conditions = ['Blinded','Entangled','Invisible','Cowering','Fear','Pinned','Dazzled','Flat-Footed','Prone','Deafened','Grappled','Sickened','Helpless','Stunned','Fatigued'],
            statusQuery='|';
            
        statusQuery += statusquery.join('|')+'}';
        return '<div style="border-top: 1px solid #000000; border-radius: .2em; background-color: white;">'//markermsg div start
                +'<b>Apply Condition/Buff Statusmarkers:</b><div style="float:right;">'+makeButton('!pfc --config,markers='+(state.PFCompanion.markers.markers==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.markers.markers==='on' ? 'ON' : 'OFF'),(state.PFCompanion.markers.markers==='on' ? 'green' : 'red'),'black')+'</div><div style="clear: both"></div>'
                +(state.PFCompanion.markers.markers=='on' ? '<div style="padding: 0em 2em;">'
                    +_.map(conditions,(c)=>{
                        return c+'<div style="float:right;">'+makeStatusButton('!pfc --config,'+c+'='+HE('?{'+c+' status marker'+statusQuery) + ' --config',state.PFCompanion.markers[c],c)+'</div><div style="clear: both"></div>';
                    }).join('')
                +'</div>'
                :
                '')
                +'</div>';
    },
    
    tokenConfig = function(){
        var linkQuery = '?{Name of attribute to link to, case insensitive. Repeating Sections not valid}';
        return '<div style="border-top: 1px solid #000000; border-radius: .2em; background-color: white;">'//markermsg div start
                +'<b>Maintain PC Default Tokens:</b><div style="float:right;">'+makeButton('!pfc --config,defaultToken='+(state.PFCompanion.defaultToken.enable==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.defaultToken.enable==='on' ? 'ON' : 'OFF'),(state.PFCompanion.defaultToken.enable==='on' ? 'green' : 'red'),'black')+'</div><div style="clear: both"></div>'
                +(state.PFCompanion.defaultToken.enable==='on' ? 
                '<table style="width:225px">'
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
                        +'<td>'+makeButton('!pfc --config,bar3Link='+linkQuery+' --config',(state.PFCompanion.defaultToken.bar3Link || '_'),'transparent',(state.PFCompanion.defaultToken.bar3Link ? 'black' : 'transparent'))+'</td>'
                        +'<td>'+makeButton('!pfc --config,bar1Link='+linkQuery+' --config',(state.PFCompanion.defaultToken.bar1Link || '_'),'transparent',(state.PFCompanion.defaultToken.bar1Link ? 'black' : 'transparent'))+'</td>'
                        +'<td>'+makeButton('!pfc --config,bar2Link='+linkQuery+' --config',(state.PFCompanion.defaultToken.bar2Link || '_'),'transparent',(state.PFCompanion.defaultToken.bar2Link ? 'black' : 'transparent'))+'</td>'
                    +'</tr><tr>'
                        +'<td><b>Visible</b></td>'
                        +'<td><div style="font-family:pictos;">'+makeButton('!pfc --config,bar3Visible='+(state.PFCompanion.defaultToken.bar3Visible==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.defaultToken.bar3Visible==='on' ? '3' : '_'),'transparent','black')+'</div></td>'
                        +'<td><div style="font-family:pictos;">'+makeButton('!pfc --config,bar1Visible='+(state.PFCompanion.defaultToken.bar1Visible==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.defaultToken.bar1Visible==='on' ? '3' : '_'),'transparent','black')+'</div></td>'
                        +'<td><div style="font-family:pictos;">'+makeButton('!pfc --config,bar2Visible='+(state.PFCompanion.defaultToken.bar2Visible==='on' ? 'off' : 'on')+' --config',(state.PFCompanion.defaultToken.bar2Visible==='on' ? '3' : '_'),'transparent','black')+'</div></td>'
                    +'</tr>'
                +'</table>'
                :
                '')
                +'</div>';
    },
    
    configAssembler = function(who){
        var menu = '/w "'+who+'" <div style="border: 1px solid black; background-color: white; padding: 3px 3px;">'//overall div for nice formatting of control panel
                    +'<div style="font-weight: bold; border-bottom: 1px solid black;font-size: 130%;">'//Control Panel Header div
                    +'[Pathfinder](https://s3.amazonaws.com/files.d20.io/images/32553318/5tI0CxKAK5nh_C6Fb-dYuw/max.png)<br>Companion API Script v'+version+'<b> Options</b>'
                    +'</div>'+tokenSetupConfig()+resourceConfig()+hpConfig()+tokenConfig()+markerConfig()+'</div>';//end Control Panel Header div
        sendChat('Pathfinder Companion',menu,null,{noarchive:true});
    },
    
    configHandler = function(who,details){
        var detailKeys = _.keys(details),
            validKeys = [,'hp','ResourceTrack','TAS'],
            createKeys = [/skill$/,/skillc$/,/checks$/,/defense$/,/attack$/,/ability$/,/item$/,/initiative$/,/spellbook$/,/fort$/,/will$/,/ref$/],
            markerKeys = ['markers','Blinded','Entangled','Invisible','Cowering','Fear','Pinned','Dazzled','Flat-Footed','Prone','Deafened','Grappled','Sickened','Helpless','Stunned'],
            initKeys = ['ResourceTrack','TAS','skill','skillc','checks','defense','fort','will','ref','attack','ability','item','spellbook','initiative','fort','will','ref'],
            tokenKeys = ['defaultToken','bar1Link','bar1Visible','bar2Link','bar2Visible','bar3Link','bar3Visible'],
            npc,allKeys;
            
        allKeys = validKeys.concat(markerKeys,initKeys,createKeys,tokenKeys);
        if(!_.some(allKeys,(ak)=>{return _.some(detailKeys,(dk)=>{return dk.match(ak)})})){
            configAssembler(who);
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
            _.some(tokenKeys,(tk)=>{
                if(dk.match(tk)){
                    dk==='defaultToken' ? state.PFCompanion.defaultToken.enable=details[tk] : (tk===dk ? state.PFCompanion.defaultToken[tk]=details[tk] : state.PFCompanion.defaultToken[tk]=undefined);
                }
            });
        });
        _.some(initKeys,(ik)=>{return _.some(detailKeys,(dk)=>{return ik===dk})}) ? _.defer(debouncedInitialize) : undefined;
    },
    
    HandleInput = function(msg_orig) {
        if(!sheetCompat){
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
                case 'config':
                    if(playerIsGM(msg.playerid)){
                        configHandler(who,cmdDetails.details);
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
                    if(cmdDetails.details.roll && playerIsGM(msg.playerid)){
                        sendGroupRoll(characters,cmdDetails.details.roll,cmdDetails.details.whisper);
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
                        _.each(characters,(c)=>{
                            if(playerIsGM(msg.playerid) || c.get('controlledby').match(/all/i) || c.get('controlledby').match(msg.playerid)){
                                applyConditions(c,cmdDetails.details.condition,cmdDetails.details.buff,cmdDetails.details.swap,cmdDetails.details.remove,cmdDetails.details.rounds);
                            }
                        });
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
                        _.each(characters,(c)=>{
                            if(playerIsGM(msg.playerid) || c.get('controlledby').match(/all/i) || c.get('controlledby').match(msg.playerid)){
                                tokenActionMaker(c,cmdDetails.details.limit,cmdDetails.details.ignore);
                            }
                        });
                    }else{
                        showHelp(who);
                    }
                    break;
		    }
		});
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
        cmdSep.action = details.match(/config|help|TAS|resource|rest|whisper|apply|parse|grouproll|buffstatus/);
        if(cmdSep.action){
            cmdSep.action = cmdSep.action[0];
        }
        details=details.replace(cmdSep.action,'');
        details = details.length>0 ? details.split(',') : undefined;
        _.each(details,(d)=>{
            vars=d.match(/(limit|ignore|item|spell|class|ability|misc|current|max|pc|npc|stats|buff|condition|hp|ResourceTrack|TAS|roll|rounds|(?:npc)?(?:skill|skillc|checks|defense|attack|ability|item|initiative|spellbook|fort|ref|will)|Blinded|Entangled|Invisible|Cowering|Fear|Pinned|Dazzled|Flat-Footed|Prone|Deafened|Grappled|Sickened|Helpless|Stunned|markers|defaultToken|bar[1-3](?:Visible|Link))(?:\:|=)([^,]+)/) || null;
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
    
    attributeHandler = function(obj,event,prev){
        try{
        if(!sheetCompat){
            return;
        }
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
                }else if(obj.get('name')==='HP' && parseInt(obj.get('current'))!==parseInt(prev.current) && state.PFCompanion.hp==='on'){
                    _.defer(handleHP,obj,prev);
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
        }catch(err){
            sendError(err);
        }
    },
    
    campaignHandler = function(obj,event,prev,depth){
        try{
        var oTurn=obj.get('turnorder'),
            pTurn=prev.turnorder,
            conditionMatch = /Condition: (.*)/,
            buffMatch = /Buff: (.*)/,
            nameMatch = /(.*(?= (?:Condition:|Buff:))) (?:Condition:|Buff:) /,
            newPrev=JSON.stringify(obj),
            buff,condition,character,name;
            
        depth = depth || 0;
        if(oTurn!==pTurn && Campaign().get('initiativepage') && !_.isEmpty(oTurn)){
            oTurn = JSON.parse(oTurn);
            if(_.isEmpty(oTurn)){
                return;
            }
            buff = oTurn[0].custom.match(buffMatch) ? oTurn[0].custom.match(buffMatch)[1] : undefined;
            condition = oTurn[0].custom.match(conditionMatch) ? oTurn[0].custom.match(conditionMatch)[1] : undefined;
            name = oTurn[0].custom.match(nameMatch) ? oTurn[0].custom.match(nameMatch)[1] : undefined;
            character = name ? _.find(findObjs({type:'character',name:name})) : undefined;
            if((buff || condition) && parseInt(oTurn[0].pr)===depth && character){
                if(!_.isEmpty(character.get('controlledby'))){
                    applyConditions(character,condition,buff,undefined,'remove');
                    _.defer(campaignHandler,obj,'change',newPrev,1);
                }
            }
        }
        }catch(err){
            sendError(err);
        }
    },
    
    graphicHandler = function(obj,event,prev){
        try{
            var character,
                ignoreChange=[1,2,3];
            if(event='change'){
                if(!_.isEmpty(obj.get('represents')) && obj.get('left')===prev.left && obj.get('top')===prev.top){
                    if(obj.get('represents')!==prev.represents){
                        mapBars(obj,getObj('character',obj.get('represents')));
                    }else if(!_.some(ignoreChange,(i)=>{return (obj.get('bar'+i+'_value')!==prev['bar'+i+'_value'] || obj.get('bar'+i+'_max')!==prev['bar'+i+'_max'])})){
                        character = getObj('character',obj.get('represents'));
                        if(character){
                            if(!_.isEmpty(character.get('controlledby'))){
                                character ? setDefaultTokenForCharacter(character, obj) : undefined;
                                updateAllTokens(character);
                            }
                        }
                    }
                }
            }
        }catch(err){
            sendError(err);
        }
    },
    
    RegisterEventHandlers = function() {
        try{
            //message handling
            on('chat:message', HandleInput);
            
            on('change:graphic',(obj,prev)=>{graphicHandler(obj,'change',prev)});
            
            //Campaign handling
            on('change:campaign:turnorder',(obj,prev)=>{campaignHandler(obj,'change',prev)});
            
            //attribute handling
            on('change:attribute',(obj,prev)=>{attributeHandler(obj,'change',prev)});
            on('add:attribute',(obj,prev)=>{attributeHandler(obj,'add',prev)});
            
            //character handling
            on('add:character',(obj,prev)=>{characterHandler(obj,'add',prev)});
            on('change:character',(obj,prev)=>{characterHandler(obj,'change',prev)});
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
