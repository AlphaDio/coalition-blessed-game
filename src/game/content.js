import { createEmpire, createArmy, createLaw, createEvent } from './types.js';

export function createSampleContent() {
  const empires = [
    createEmpire('empire_1', 'The Northern Federation', 60, 120, { industrial: true }),
    createEmpire('empire_2', 'The Southern Alliance', 50, 100, { agricultural: true }),
    createEmpire('empire_3', 'The Eastern Republic', 55, 110, { maritime: true })
  ];
  
  const armies = [
    createArmy('army_1', 'empire_1', '1st Northern Division', 60, 70, 60),
    createArmy('army_2', 'empire_1', '2nd Northern Division', 55, 65, 50),
    createArmy('army_3', 'empire_2', 'Southern Guard', 50, 60, 55),
    createArmy('army_4', 'empire_3', 'Eastern Fleet Marines', 65, 75, 45)
  ];
  
  const laws = [
    createLaw('law_1', 'War Tax', 0, 0, {
      empireApproval: { empire_1: -5, empire_2: -5, empire_3: -5 },
      armyOrgConversion: { multiplier: 1.1 }
    }),
    createLaw('law_2', 'Northern Industrial Support', 0, 2, {
      empireApproval: { empire_1: 10, empire_2: -5, empire_3: -5 },
      armyOrgConversion: { empireIds: ['empire_1'], multiplier: 1.2 }
    }),
    createLaw('law_3', 'Southern Agricultural Aid', 0, 2, {
      empireApproval: { empire_1: -5, empire_2: 10, empire_3: -5 },
      stockpiles: { supplies: 200 }
    }),
    createLaw('law_4', 'Eastern Trade Accord', 0, 3, {
      empireApproval: { empire_1: -3, empire_2: -3, empire_3: 15 },
      stockpiles: { alloys: 100, fuel: 50 }
    }),
    createLaw('law_5', 'Coalition Unity Act', 0, 5, {
      empireApproval: { empire_1: 5, empire_2: 5, empire_3: 5 },
      cohesionModifier: 0.9 // Reduces cohesion loss by 10%
    }),
    createLaw('law_6', 'Emergency Powers', 0, 4, {
      empireApproval: { empire_1: -10, empire_2: -10, empire_3: -10 },
      armyOrgConversion: { multiplier: 1.15 }
    })
  ];
  
  const events = [
    createEvent('event_1', 'Supply Convoy Attacked', 
      'A supply convoy has been ambushed by Scourge forces. How do you respond?',
      [
        {
          text: 'Send reinforcements (lose supplies, gain approval)',
          effects: {
            stockpiles: { supplies: -100 },
            empireApproval: { empire_1: 5, empire_2: 5, empire_3: 5 }
          }
        },
        {
          text: 'Abandon convoy (lose approval, save resources)',
          effects: {
            empireApproval: { empire_1: -10, empire_2: -10, empire_3: -10 }
          }
        },
        {
          text: 'Negotiate with local forces (uncertain outcome)',
          effects: {
            coalitionCohesion: () => Math.random() > 0.5 ? 5 : -5,
            scourgeCohesion: () => Math.random() > 0.5 ? -3 : 0
          }
        }
      ]
    ),
    createEvent('event_2', 'Heroic Stand',
      'One of your armies has made a heroic stand against overwhelming odds.',
      [
        {
          text: 'Publicize the victory (gain fervor, lose organization)',
          effects: {
            armyFervor: { army_1: 10, army_2: 10, army_3: 10, army_4: 10 }
          }
        },
        {
          text: 'Rotate forces (gain organization, lose fervor)',
          effects: {
            armyFervor: { army_1: -5, army_2: -5, army_3: -5, army_4: -5 }
          }
        },
        {
          text: 'Strategic withdrawal (minimal changes)',
          effects: {}
        }
      ]
    ),
    createEvent('event_3', 'Diplomatic Crisis',
      'Tensions rise between empires over resource allocation.',
      [
        {
          text: 'Favor Northern Federation',
          effects: {
            empireApproval: { empire_1: 15, empire_2: -10, empire_3: -10 }
          }
        },
        {
          text: 'Favor Southern Alliance',
          effects: {
            empireApproval: { empire_1: -10, empire_2: 15, empire_3: -10 }
          }
        },
        {
          text: 'Mediate (small approval gains)',
          effects: {
            empireApproval: { empire_1: 3, empire_2: 3, empire_3: 3 },
            coalitionCohesion: -2
          }
        }
      ]
    ),
    createEvent('event_4', 'Scourge Advance',
      'Scourge forces are advancing on a key position.',
      [
        {
          text: 'Stand and fight (battle risk, potential victory)',
          effects: {
            coalitionCohesion: -3,
            scourgeCohesion: -5
          }
        },
        {
          text: 'Tactical retreat (lose cohesion, save forces)',
          effects: {
            coalitionCohesion: -5,
            scourgeCohesion: 2
          }
        },
        {
          text: 'Scorched earth (lose supplies, damage Scourge)',
          effects: {
            stockpiles: { supplies: -150, fuel: -50 },
            scourgeCohesion: -8
          }
        }
      ]
    ),
    createEvent('event_5', 'Resource Discovery',
      'A new resource cache has been discovered.',
      [
        {
          text: 'Secure immediately (gain resources)',
          effects: {
            stockpiles: { supplies: 200, alloys: 100, fuel: 75 }
          }
        },
        {
          text: 'Share with all empires (gain approval)',
          effects: {
            stockpiles: { supplies: 100, alloys: 50, fuel: 35 },
            empireApproval: { empire_1: 8, empire_2: 8, empire_3: 8 }
          }
        },
        {
          text: 'Leave for later (gain cohesion)',
          effects: {
            coalitionCohesion: 3
          }
        }
      ]
    ),
    createEvent('event_6', 'Desertion Crisis',
      'Reports of desertions are increasing due to low morale.',
      [
        {
          text: 'Increase war funds (lose resources, gain organization)',
          effects: {
            stockpiles: { supplies: -100, alloys: -50 }
          }
        },
        {
          text: 'Propaganda campaign (gain fervor, lose approval)',
          effects: {
            armyFervor: { army_1: 8, army_2: 8, army_3: 8, army_4: 8 },
            empireApproval: { empire_1: -5, empire_2: -5, empire_3: -5 }
          }
        },
        {
          text: 'Crack down (reduce aggravation, lose approval)',
          effects: {
            empireApproval: { empire_1: -8, empire_2: -8, empire_3: -8 }
          }
        }
      ]
    )
  ];
  
  return { empires, armies, laws, events };
}
