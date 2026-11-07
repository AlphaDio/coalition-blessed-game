// Expedition content is deliberately separate from Coalition empires: contacts
// have one output, one need and no council votes, population or law processes.
export const EXPEDITION_STARTER_SUPPLIES = { super_alloys: 240, biomass: 220, plasma_fuel: 160 };

export const EXPEDITION_PLAN = {
  id: 'frontier', name: 'Frontier expedition', durationRange: { min: 10, max: 16 },
  description: 'Explore uncharted systems and return with one new independent empire or discovery.',
  materialsByDestination: {
    empire: { biomass: 150, plasma_fuel: 100 },
    discovery: { super_alloys: 150, plasma_fuel: 100 }
  },
  costGrowthPerLaunch: 0.25
};

export const DEVELOPMENT_PROJECTS = [
  { id: 'industry', name: 'Expand local industry', duration: 6, maxLevel: 3,
    description: 'Each level adds 50% of the original output. Completes after construction; requires 40 approval.',
    cost: { requisition: 35, materials: { super_alloys: 90, biomass: 35, plasma_fuel: 20 } } },
  { id: 'infrastructure', name: 'Build civilian infrastructure', duration: 5, maxLevel: 2,
    description: 'Each level reduces original sustainment by 20%, and improves approval. Requires 40 approval.',
    cost: { requisition: 25, materials: { super_alloys: 65, biomass: 60, plasma_fuel: 25 } } }
];

const interest = (id, name, description, commodity) => ({ id, name, description, commodity });
export const EMPIRE_TEMPLATES = [
  { id: 'cinder_compact', name: 'Cinder Compact', description: 'Furnace habitats whose guilds prize productive investment.',
    production: { commodity: 'super_alloys', amount: 24 }, sustain: { commodity: 'biomass', amount: 8 }, approval: 48, defense: 7000,
    interest: interest('industry', 'Industry', 'Industrial development earns extra approval.', 'super_alloys') },
  { id: 'verdant_enclaves', name: 'Verdant Enclaves', description: 'Independent garden worlds seeking reliable civilian support.',
    production: { commodity: 'biomass', amount: 30 }, sustain: { commodity: 'plasma_fuel', amount: 8 }, approval: 52, defense: 5000,
    interest: interest('welfare', 'Civilian welfare', 'Supply aid and civilian infrastructure earn extra approval.', 'biomass') },
  { id: 'glass_observatory', name: 'Glass Observatory', description: 'Scholars living around a rare-gas giant.',
    production: { commodity: 'rare_gases', amount: 5 }, sustain: { commodity: 'super_alloys', amount: 10 }, approval: 43, defense: 6000,
    interest: interest('knowledge', 'Knowledge', 'Completing discovery studies earns approval.', 'super_alloys') },
  { id: 'free_harbors', name: 'Free Harbors', description: 'Fuel traders who fiercely protect their sovereignty.',
    production: { commodity: 'plasma_fuel', amount: 28 }, sustain: { commodity: 'biomass', amount: 9 }, approval: 45, defense: 8500,
    interest: interest('sovereignty', 'Sovereignty', 'Pacts and liberation earn approval; conquest of any contact causes extra outrage.', 'plasma_fuel') },
  { id: 'gene_cantons', name: 'Gene Cantons', description: 'Biological artisans trading engineered seed archives.',
    production: { commodity: 'genomes', amount: 3 }, sustain: { commodity: 'biomass', amount: 10 }, approval: 50, defense: 5500,
    interest: interest('welfare', 'Civilian welfare', 'Supply aid and civilian infrastructure earn extra approval.', 'biomass') },
  { id: 'relic_wardens', name: 'Relic Wardens', description: 'Guardians of ancient ruins, wary of outside dominion.',
    production: { commodity: 'ancient_relics', amount: 2 }, sustain: { commodity: 'plasma_fuel', amount: 9 }, approval: 38, defense: 9000,
    interest: interest('sovereignty', 'Sovereignty', 'Pacts and liberation earn approval; conquest of any contact causes extra outrage.', 'super_alloys') }
];

export const DISCOVERY_TEMPLATES = [
  { id: 'derelict_convoy', name: 'Derelict Convoy', description: 'An abandoned relief convoy, its cargo still intact.',
    benefitDescription: 'Recover 300 Super Alloys, 180 Biomass and 120 Plasma Fuel once.',
    duration: 2, cost: { requisition: 10, materials: { plasma_fuel: 10 } },
    reward: { type: 'cache', materials: { super_alloys: 300, biomass: 180, plasma_fuel: 120 } } },
  { id: 'ancient_relay', name: 'Ancient Relay', description: 'A quiet listening station beyond Coalition charts.',
    benefitDescription: '+0.5 Coalition Intel each turn after study.',
    duration: 5, cost: { requisition: 35, materials: { super_alloys: 60, plasma_fuel: 25 } }, reward: { type: 'intel', amount: 0.5 } },
  { id: 'precursor_foundry', name: 'Precursor Foundry', description: 'A lost fabrication complex with recoverable construction plans.',
    benefitDescription: '+10% improvement construction speed after study.',
    duration: 6, cost: { requisition: 40, materials: { super_alloys: 90, plasma_fuel: 25 } }, reward: { type: 'construction', amount: 0.1 } },
  { id: 'living_nebula', name: 'Living Nebula', description: 'A self-sustaining ecosystem whose medicines can be shared.',
    benefitDescription: '+0.05 approval per turn to every Coalition empire after study.',
    duration: 5, cost: { requisition: 30, materials: { biomass: 80, plasma_fuel: 20 } }, reward: { type: 'approval', amount: 0.05 } },
  { id: 'silent_archive', name: 'Silent Archive', description: 'A library of engineering records written before the Scourge.',
    benefitDescription: '+0.5 research points per turn to every Coalition empire after study.',
    duration: 6, cost: { requisition: 40, materials: { super_alloys: 70, biomass: 30 } }, reward: { type: 'research', amount: 0.5 } },
  { id: 'transit_lattice', name: 'Transit Lattice', description: 'An ancient route network that shortens Coalition supply lines.',
    benefitDescription: '+5% consumption requisition generation and +30% expedition speed after study.',
    expeditionSpeedBonus: 0.3,
    duration: 6, cost: { requisition: 40, materials: { super_alloys: 80, plasma_fuel: 40 } }, reward: { type: 'requisition', amount: 0.05 } }
];

export const EXPEDITION_RULES = {
  slots: 1, aidCooldown: 6, raidWarning: 4, raidCooldown: 20,
  occupationDuration: 15, pactApproval: 65, pactBreakApproval: 40,
  conquestCost: { requisition: 125, materials: { super_alloys: 100, plasma_fuel: 60 } }
};
