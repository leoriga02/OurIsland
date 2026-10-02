// Early-game progression: short objectives that always say what to do next and what it unlocks.
// survive → gather → first tool → water & food → spear → camp → shelter → storage → first crop → bed → explore
const ate = (s) => Object.values(s.ate || {}).reduce((a, b) => a + b, 0);
export const QUESTS = [
  {
    id: 'gather', title: 'Naufraghi',
    lines: (s) => [
      { text: `Raccogli bastoni (${Math.min(s.col.stick || 0, 3)}/3)`, done: (s.col.stick || 0) >= 3 },
      { text: `Raccogli pietre (${Math.min(s.col.stone || 0, 3)}/3)`, done: (s.col.stone || 0) >= 3 },
    ],
    hint: 'Avvicinati agli oggetti sulla spiaggia e premi il tasto azione.',
    goal: 'Servono per il tuo primo attrezzo',
  },
  {
    id: 'fiber', title: 'Fibra vegetale',
    lines: (s) => [{ text: `Raccogli fibra (${Math.min(s.col.fiber || 0, 4)}/4)`, done: (s.col.fiber || 0) >= 4 }],
    hint: 'Le piante d’erba alte e chiare vicino alla spiaggia danno fibra (e a volte un germoglio).',
    goal: 'La fibra lega gli attrezzi e diventa corda',
  },
  {
    id: 'axe', title: 'Il primo attrezzo',
    lines: (s) => [{ text: 'Crea un’ascia di pietra', done: (s.crafted.axe || 0) + (s.crafted.axe2 || 0) >= 1 }],
    hint: 'Apri lo zaino e vai alla scheda Crea.',
    goal: 'Sblocca: abbattere alberi per legno e foglie',
  },
  {
    id: 'chop', title: 'Legname!',
    lines: (s) => [{ text: `Abbatti un albero (${Math.min(s.felled, 1)}/1)`, done: s.felled >= 1 }],
    hint: 'Mettiti davanti a una palma con l’ascia e continua a premere azione.',
    goal: 'Sblocca: livello Base (rifugio, cassa, giaciglio)',
  },
  {
    id: 'drink', title: 'Acqua dolce',
    lines: (s) => [{ text: 'Placa la sete', done: s.drank >= 1 || (s.ate.coconut || 0) >= 1 }],
    hint: 'Segui il sentiero verso l’interno fino al laghetto della cascata, oppure apri un cocco.',
    goal: 'Senza acqua la salute cala',
  },
  {
    id: 'food', title: 'Qualcosa da mangiare',
    lines: (s) => [{ text: 'Mangia qualcosa', done: ate(s) >= 1 }],
    hint: 'Bacche dai cespugli rossi, cocchi sotto le palme o granchi sulla spiaggia.',
    goal: 'Il cibo mantiene le forze',
  },
  {
    id: 'spear', title: 'Difendersi',
    lines: (s) => [{ text: 'Crea una lancia', done: (s.crafted.spear || 0) + (s.crafted.spear2 || 0) >= 1 }],
    hint: 'Nella giungla vivono cinghiali. Una lancia infligge più danni dei pugni.',
    goal: 'Sblocca: caccia (carne e pelle)',
  },
  {
    id: 'campfire', title: 'L’accampamento',
    lines: (s) => [
      { text: 'Crea un falò', done: (s.crafted.campfire || 0) >= 1 },
      { text: 'Posiziona il falò', done: s.placed.campfire >= 1 },
    ],
    hint: 'Tocca il falò nella barra rapida per posizionarlo.',
    goal: 'Luce e calore di notte, e si cucina la carne',
  },
  {
    id: 'foundation', title: 'Una casa tutta tua',
    lines: (s) => [
      { text: 'Crea una corda con la fibra', done: (s.crafted.rope || 0) >= 1 || s.placed.foundation >= 1 },
      { text: 'Costruisci una fondazione in legno', done: s.placed.foundation >= 1 },
    ],
    hint: 'Tocca il martello per costruire. Il terreno piano è l’ideale.',
    goal: 'Un rifugio ti protegge e ti cura più in fretta',
  },
  {
    id: 'walls', title: 'Alza le pareti',
    lines: (s) => [
      { text: `Pareti (${Math.min(s.placed.walls, 3)}/3)`, done: s.placed.walls >= 3 },
      { text: 'Una porta', done: s.placed.doorway >= 1 },
    ],
    hint: 'Le pareti si agganciano ai bordi della fondazione. Ruota la visuale per scegliere il lato.',
  },
  {
    id: 'roof', title: 'Un tetto sopra la testa',
    lines: (s) => [{ text: 'Aggiungi un tetto di paglia', done: s.placed.roof >= 1 }],
    hint: 'Le foglie di palma si ottengono abbattendo le palme.',
    goal: 'Sblocca: livello Coltivazione',
  },
  {
    id: 'chest', title: 'Un posto per le scorte',
    lines: (s) => [{ text: 'Costruisci una cassa di legno', done: (s.placed.chest || 0) + (s.placed.big_chest || 0) >= 1 }],
    hint: 'Crea la cassa dallo zaino e posizionala vicino al rifugio. Toccala per depositare.',
    goal: 'Lo zaino si riempie in fretta',
  },
  {
    id: 'farm', title: 'Il primo raccolto',
    lines: (s) => [
      { text: 'Posiziona un orto', done: (s.placed.farm_plot || 0) >= 1 },
      { text: 'Pianta un germoglio di fibra', done: (s.planted || 0) >= 1 },
      { text: 'Raccogli la fibra matura', done: (s.harvested || 0) >= 1 },
    ],
    hint: 'I germogli arrivano dalle piante di fibra selvatiche. La fibra cresce in circa 4 minuti.',
    goal: 'Fibra infinita: la base diventa autosufficiente',
  },
  {
    id: 'bed', title: 'Sogni d’oro',
    lines: (s) => [
      { text: 'Crea un giaciglio di foglie', done: (s.crafted.bed || 0) >= 1 },
      { text: 'Posizionalo nella capanna', done: s.placed.bed >= 1 },
      { text: 'Dormi o riposa nel giaciglio', done: s.slept >= 1 },
    ],
    hint: 'Dormire di notte ti porta al mattino e imposta il punto di rinascita.',
  },
  {
    id: 'water', title: 'Acqua alla base',
    lines: (s) => [
      { text: 'Costruisci un raccoglitore d’acqua', done: (s.placed.water_collector || 0) >= 1 },
      { text: 'Bevi dal raccoglitore', done: (s.collected || 0) >= 1 },
    ],
    hint: 'Si riempie da solo col tempo. Niente più viaggi alla cascata.',
    goal: 'Acqua sicura ogni giorno',
  },
  {
    id: 'crops', title: 'Cibo dall’orto',
    lines: (s) => [{ text: 'Raccogli patate, mais, erbe o ananas', done: foodHarvests(s) >= 1 }],
    hint: 'I semi arrivano dalle casse del relitto, dai cespugli di bacche e dalle casse portate dal mare.',
    goal: 'Il cibo non dipenderà più dalla fortuna',
  },
  {
    id: 'fish', title: 'Pesca',
    lines: (s) => [
      { text: 'Crea una canna da pesca', done: (s.crafted.fishing_rod || 0) >= 1 },
      { text: 'Pesca un pesce', done: (s.fished || 0) >= 1 },
    ],
    hint: 'Equipaggia la canna, guarda l’acqua e premi azione. Quando il galleggiante affonda: tira!',
    goal: 'Un’alternativa alla caccia',
  },
  {
    id: 'cook', title: 'Ai fornelli',
    lines: (s) => [{ text: 'Prepara un piatto vicino al falò', done: (s.meals || 0) >= 1 }],
    hint: 'Nella scheda Crea, sezione Cucina. I piatti danno effetti utili per qualche minuto.',
    goal: 'Pasti migliori, più energia',
  },
  {
    id: 'coop', title: 'Il pollaio',
    lines: (s) => [
      { text: 'Costruisci un pollaio', done: (s.placed.coop || 0) >= 1 },
      { text: 'Raccogli un uovo dal pollaio', done: (s.eggs || 0) >= 1 },
    ],
    hint: 'Metti a covare un uovo selvatico (nei nidi della giungla) e dai mais alle galline.',
    goal: 'Uova ogni giorno',
  },
];

QUESTS.push(
  {
    id: 'cave', title: 'La grotta',
    lines: (s) => [{ text: 'Raggiungi la sala più profonda della grotta', done: !!s.reachedDeep }],
    hint: 'L’ingresso è ai piedi della grande parete del monte, a ovest della cascata. Porta una torcia e scorte da viaggio.',
    goal: 'Minerali e un progetto che non trovi altrove',
  },
  {
    id: 'ore', title: 'Minatore',
    lines: (s) => [{ text: `Estrai minerale di ferro (${Math.min(s.col.iron_ore || 0, 4)}/4)`, done: (s.col.iron_ore || 0) >= 4 }],
    hint: 'Le vene rossastre lungo le pareti della grotta. Serve un piccone.',
    goal: 'Il ferro serve per attrezzi migliori',
  },
  {
    id: 'smelt', title: 'Fuoco e metallo',
    lines: (s) => [
      { text: 'Costruisci una fornace', done: (s.placed.furnace || 0) >= 1 },
      { text: 'Fondi un lingotto di ferro', done: (s.smelted || 0) >= 1 },
    ],
    hint: 'Metti minerale e legna nella fornace e attendi. Il progetto è nel forziere in fondo alla grotta.',
    goal: 'Sblocca: livello Metallo',
  },
  {
    id: 'metaltool', title: 'L’età del ferro',
    lines: (s) => [{ text: 'Crea un attrezzo di ferro', done: ['pickaxe3', 'axe3', 'spear3'].some((k) => (s.crafted[k] || 0) >= 1) }],
    hint: 'Il piccone di ferro spacca anche l’ossidiana delle sale profonde.',
    goal: 'Raccolta più rapida, armi più forti',
  },
);

const foodHarvests = (s) => ['potato', 'corn', 'herb', 'pineapple'].reduce((a, k) => a + ((s.harvestedCrops || {})[k] || 0), 0);

// long-term goal: a base that keeps you alive on its own
export const SELF_SUFFICIENCY = [
  { text: 'Rifugio', done: (s) => !!s.shelterDone },
  { text: 'Acqua alla base', done: (s) => (s.placed.water_collector || 0) >= 1 },
  { text: 'Orto di cibo', done: (s) => foodHarvests(s) >= 1 },
  { text: 'Fibra coltivata', done: (s) => ((s.harvestedCrops || {}).fiber || 0) >= 1 },
  { text: 'Galline', done: (s) => (s.eggs || 0) >= 1 },
  { text: 'Scorte in cassa', done: (s) => (s.placed.chest || 0) + (s.placed.big_chest || 0) >= 1 },
];

export const FREE_PLAY = (s) => ({
  title: 'Base autosufficiente',
  lines: SELF_SUFFICIENCY.filter((g) => !g.done(s)).slice(0, 2).map((g) => ({ text: g.text, done: false }))
    .concat([{ text: `Trova le scorte nascoste (${Object.keys(s.caches || {}).length}/8)`, done: Object.keys(s.caches || {}).length >= 8 }]),
  hint: 'Cascata, grotta, caletta nascosta, belvedere e scogliere nascondono casse utili.',
  goal: 'Più la base è completa, più la vita sull’isola è facile',
});

// order of the old (v3 and earlier) quest list, to convert saved questIndex values
export const LEGACY_ORDER = ['gather', 'fiber', 'axe', 'chop', 'campfire', 'drink', 'foundation', 'walls', 'roof', 'bed'];
