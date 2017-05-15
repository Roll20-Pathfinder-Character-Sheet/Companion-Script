To start up type:
!pfc --help


1. Applying buffs/conditions: the buff or condition is activated, but we are still working on getting a given effect to fully propagate throughout the sheet
1. Statblock parsing: 
    1. DO NOT attempt to parse Lucifer, Prince of Darkness from pfsrd. He is just too large, and will almost certainly crash your script environment by triggering an infinite loop error.
    1. While the script supports importing of multiple statblocks with a single command, limit how many creatures you import at a given time as the time it takes to import increases non-linearly (especially if they cast spells).
1. I would recommend waiting to install the script until I upload the next version of the beta as some of the syntax for how resource tracking is handled will be changed.
