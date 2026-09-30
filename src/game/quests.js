// Guided early-game objective chain: explore → gather → craft → survive → build → improve.
export const QUESTS = [
  {
    id: 'gather', title: 'Naufraghi',
    lines: (s) => [
      { text: `Raccogli bastoni (${Math.min(s.col.stick || 0, 3)}/3)`, done: (s.col.stick || 0) >= 3 },
      { text: `Raccogli pietre (${Math.min(s.col.stone || 0, 3)}/3)`, done: (s.col.stone || 0) >= 3 },
    ],
    hint: 'Avvicinati agli oggetti sulla spiaggia e premi il tasto azione.',
  },
  {
    id: 'fiber', title: 'Fibra vegetale',
    lines: (s) => [{ text: `Raccogli fibra (${Math.min(s.col.fiber || 0, 4)}/4)`, done: (s.col.fiber || 0) >= 4 }],
    hint: 'Le piante d’erba alte e chiare vicino alla spiaggia danno fibra.',
  },
  {
    id: 'axe', title: 'Il primo attrezzo',
    lines: (s) => [{ text: 'Crea un’ascia di pietra', done: (s.crafted.axe || 0) >= 1 }],
    hint: 'Apri lo zaino e vai alla scheda Crea.',
  },
  {
    id: 'chop', title: 'Legname!',
    lines: (s) => [{ text: `Abbatti un albero (${Math.min(s.felled, 1)}/1)`, done: s.felled >= 1 }],
    hint: 'Mettiti davanti a una palma con l’ascia e continua a premere azione.',
  },
  {
    id: 'campfire', title: 'L’accampamento',
    lines: (s) => [
      { text: 'Crea un falò', done: (s.crafted.campfire || 0) >= 1 },
      { text: 'Posiziona il falò', done: s.placed.campfire >= 1 },
    ],
    hint: 'Le pietre sono lungo tutta la spiaggia. Tocca il falò nella barra rapida per posizionarlo.',
  },
  {
    id: 'drink', title: 'Acqua dolce',
    lines: (s) => [{ text: 'Placa la sete', done: s.drank >= 1 || (s.ate.coconut || 0) >= 1 }],
    hint: 'Segui il sentiero verso l’interno fino al laghetto della cascata, oppure apri un cocco.',
  },
  {
    id: 'foundation', title: 'Una casa tutta tua',
    lines: (s) => [
      { text: 'Crea una corda con la fibra', done: (s.crafted.rope || 0) >= 1 || s.placed.foundation >= 1 },
      { text: 'Costruisci una fondazione in legno', done: s.placed.foundation >= 1 },
    ],
    hint: 'Tocca il martello per costruire. Il terreno piano è l’ideale.',
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
  title: 'Vita sull’isola',
  lines: [
    { text: 'Cuoci un granchio sul falò', done: (s.crafted.crab_cooked || 0) >= 1 },
    { text: `Amplia la casa (${Math.min(s.placed.foundation, 4)}/4 pavimenti)`, done: s.placed.foundation >= 4 },
    { text: 'Sali fino ai piedi dei picchi carsici', done: s.reachedPeak },
  ],
  hint: 'La tua prima casa è pronta. Esplora, raccogli e amplia il campo!',
});
