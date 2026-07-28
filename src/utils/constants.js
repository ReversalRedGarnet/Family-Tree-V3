// Card shape is derived from gender, never chosen by hand.
export const GENDERS = [
  { id: 'male', label: 'Male', shape: 'rectangle' },
  { id: 'female', label: 'Female', shape: 'circle' },
];

export const DEFAULT_GENDER = 'male';

export function shapeForGender(gender) {
  return GENDERS.find((g) => g.id === gender)?.shape || 'rectangle';
}

export const COLOR_THEMES = [
  { id: 'cyan', label: 'Cyan', hex: '#0EA5B7' },
  { id: 'teal', label: 'Teal', hex: '#0B6E7C' },
  { id: 'sky', label: 'Sky', hex: '#3B93D6' },
  { id: 'sage', label: 'Sage', hex: '#5FA88C' },
  { id: 'plum', label: 'Plum', hex: '#8C6BA8' },
  { id: 'clay', label: 'Clay', hex: '#D08A6A' },
  { id: 'slate', label: 'Slate', hex: '#5B7C85' },
];

// ---- Relationship model ----
// Every link between two people is one relationship record. Nothing is a
// prerequisite for anything else: you can add a sibling with no parents on
// the board, or a child with no partner.
//
//   partner  a <-> b   same generation
//   parent   a  -> b   a is the parent of b, b sits one generation below
//   sibling  a <-> b   same generation
//   other    a <-> b   no generation constraint at all

export const RELATIONSHIP_KINDS = [
  {
    id: 'partner',
    label: 'Partners',
    hint: 'Married, together, engaged — anyone sharing a partnership.',
    directed: false,
  },
  {
    id: 'parent',
    label: 'Parent and child',
    hint: 'One person is the parent. No second parent needed.',
    directed: true,
  },
  {
    id: 'sibling',
    label: 'Siblings',
    hint: 'Brothers and sisters. Their parents can be added later, or never.',
    directed: false,
  },
  {
    id: 'other',
    label: 'Something else',
    hint: 'Guardian, godparent, close friend — label it yourself.',
    directed: false,
  },
];

export const PARTNER_TYPES = [
  { id: 'marriage', label: 'Married' },
  { id: 'partner', label: 'Partners' },
  { id: 'engaged', label: 'Engaged' },
];

export const PARTNER_STATUS = [
  { id: 'together', label: 'Together' },
  { id: 'separated', label: 'Separated' },
  { id: 'divorced', label: 'Divorced' },
  { id: 'widowed', label: 'Widowed' },
];

export const SIBLING_TYPES = [
  { id: 'full', label: 'Siblings' },
  { id: 'half', label: 'Half siblings' },
  { id: 'step', label: 'Step siblings' },
];

export const PARENT_TYPES = [
  { id: 'birth', label: 'Birth parent' },
  { id: 'adoptive', label: 'Adoptive parent' },
  { id: 'step', label: 'Step parent' },
  { id: 'foster', label: 'Foster parent' },
  { id: 'guardian', label: 'Guardian' },
];

// ---- Line language ----
// Each relationship reads differently at a glance: colour, dash pattern and
// midpoint marker all carry meaning. The sidebar legend renders the same
// glyphs, so the key and the board never drift apart.
export const LINE_STYLES = {
  marriage:   { color: '#0B6E7C', width: 2.5, dash: null,     marker: 'ring-filled', label: 'Married' },
  partner:    { color: '#0B6E7C', width: 2.5, dash: null,     marker: 'dot',         label: 'Partners' },
  engaged:    { color: '#0B6E7C', width: 2.5, dash: [9, 5],   marker: 'ring-open',   label: 'Engaged' },
  separated:  { color: '#7A9299', width: 2,   dash: [4, 6],   marker: 'none',        label: 'Separated' },
  divorced:   { color: '#7A9299', width: 2,   dash: [4, 6],   marker: 'break',       label: 'Divorced' },
  widowed:    { color: '#7A9299', width: 2.5, dash: null,     marker: 'none',        label: 'Widowed' },
  parent:     { color: '#0EA5B7', width: 2,   dash: null,     marker: 'none',        label: 'Parent and child' },
  parentSoft: { color: '#7FD3DD', width: 2,   dash: [6, 4],   marker: 'none',        label: 'Step / adoptive' },
  sibling:    { color: '#7A9299', width: 2,   dash: [2, 5],   marker: 'none',        label: 'Siblings' },
  other:      { color: '#A8BEC4', width: 1.75, dash: [1, 5],  marker: 'none',        label: 'Other link' },
};

// ---- Layout ----
export const ROW_HEIGHT = 210;
export const CARD_WIDTH = 158;
export const CARD_HEIGHT = 92;
export const TOP_MARGIN = 120;
export const COLUMN_GAP = 44;
export const OVERLAP_THRESHOLD = 0.3;
export const MAX_HISTORY = 50;

// Horizontal distance between the centres of two neighbouring cards. Also
// the step used when hunting for a free slot beside an existing person.
export const SLOT_STEP = CARD_WIDTH + COLUMN_GAP;

// ---- Breakpoint used by the responsive layout ----
export const MOBILE_BREAKPOINT = 768;
