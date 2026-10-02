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
];

export const FREE_PLAY = (s) => ({
  title: 'Esplora l’isola',
  lines: [
    { text: `Trova le scorte nascoste (${Object.keys(s.caches || {}).length}/7)`, done: Object.keys(s.caches || {}).length >= 7 },
    { text: 'Trova un progetto per attrezzi migliori', done: !!s.blueprints?.tools2 },
    { text: 'Sali fino ai piedi dei picchi carsici', done: s.reachedPeak },
  ],
  hint: 'Cascata, grotta, caletta nascosta, belvedere e scogliere nascondono casse utili.',
  goal: 'Sblocca nuovi progetti e materiali rari',
});

// order of the old (v3 and earlier) quest list, to convert saved questIndex values
export const LEGACY_ORDER = ['gather', 'fiber', 'axe', 'chop', 'campfire', 'drink', 'foundation', 'walls', 'roof', 'bed'];
