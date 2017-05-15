THIS IS STILL BETA SO USE ON A COPY OF YOUR CAMPAIGN OR CHARACTERS. The API can access multiple characters at once so it is best to backup first.

To start up type:
!pfc --help

To access the menu type:
!pfc --config

Known issues
------------
1. Applying buffs/conditions: the buff or condition is activated, but we are still working on getting a given effect to fully propagate throughout the sheet
1. Statblock parsing: 
    1. DO NOT attempt to parse Lucifer, Prince of Darkness from pfsrd. He is just too large, and will almost certainly crash your script environment by triggering an infinite loop error.
    1. While the script supports importing of multiple statblocks with a single command, limit how many creatures you import at a given time as the time it takes to import increases non-linearly (especially if they cast spells).
1. I would recommend waiting to install the script until I upload the next version of the beta as some of the syntax for how resource tracking is handled will be changed.

Token Actions
-------------
This creates token actions for the main menu buttons at the top of the character sheet.
Access the config menu by typing !pfc --config To create token macros click on token actions to switch from 'Off' to 'Auto'. Then open a character sheet. When you look at the Abilities tab you'll see the menus already there. Click on the token and you will see the macros appear at the upper left as token actions. 


Automatic Attribute Handling
----------------------------
HP & Temp HP: If this option is enabled in the config menu health deducted from a character's HP will be deducted from their temp hp first before being applied to their HP. Note this will not work with API applied HP changes (other than those caused by this script).
Macro Setup

Weapons: Weapons can be setup to track ammo usage (according to # of attacks used, including usage of manyshot), other item usage, spell usage, ability usage, and custom attribute usage.

Ammo Tracking: Setting the ammo field of a weapon to anything besides 1 tells the script that that weapon uses ammo. The script willgenerate the following field in the macro text of the weapon: ||ammo=?{Name of Ammunition Item}||. After the first time you answer this query, it will be replaced with your response.You can also manually put a different query in here to be prompted for what ammunition to use with each attack routine.

Spell or Ability Tracking: If a weapon is linked to a spell or ability (that has uses), an additional roll template field will be added to the macro that will display a button to outputthe spell card as well as buttons to increment, decrement, or custom adjust the number of spells used.

Spells: A field similar to that for weapons linked to a spell will be added to all spells.

Abilities: A field similar to that for weapons linked to an ability will be added to all abilities that have uses.
custom attribute: Entering %%What you named the custom attribute%% into the description field (notes field for weapons) will cause the script to put a field similar to the spell or ability to allow you to adjust the quantity of it. This will only be created for those custom attributes that have a current/max comparison. This can also be used to add fields for spells,abilities, or items without having to directly edit the macro text.

Command syntax
--------------
Item tracking: !pfc --resource,item=Item Name,current=max OR +/-X OR X,max=+/-X OR X|characterid|characterid|...

Ability tracking: !pfc --resource,ability=Ability Name,current=max OR +/-X OR X|characterid|characterid|...

Spell tracking: !pfc --resource,spell=Spell Name,current=max OR +/-X OR X|characterid|characterid|...

Custom Attribute tracking: !pfc --resource,note=Custom Attribute Name,current=max OR +/-X OR X|characterid|characterid|...

Whisper Adjusting: !pfc --whisper,npc=public/private/swap,pc=public/private/swap,stats=public/private/swap|characerid|characterid|...

Access the Config Menu: !pfc --config

Apply/Remove Buffs Conditions: !pfc --apply,condition=all or part of a condtion name,buff=all or part of a buff name that has already been setup on the character,remove/swap|characterid|characterid|...

Import Statblock: !pfc --parse|characterid|characterid|characterid| OR !pfc --parse|{{statblock NEWCREATURE statblock NEW CREATURE ...}}

Copy your statblock (pure text only - copy into a text editor first to clean off formatting) into the gmnotes of a fresh character or directly via chat, and then run the command. I have only tested the parser on pfsrd statblocks (and not many of those) so far, and hope to overcome the issues preventing multiple statblocks from being imported at once, as well as hopefully eventually allowing statblocks to be imported from chat.


