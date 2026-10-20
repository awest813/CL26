import teamsData from '../data/teams128.json' with { type: 'json' };

export interface TeamMark {
  letters: string;
  primary: string;
  secondary: string;
  ink: string;
}

const STOP_WORDS = new Set(['university', 'college', 'tech', 'institute', 'school', 'the', 'of', 'and', 'at']);

const COLORS: Array<Pick<TeamMark, 'primary' | 'secondary' | 'ink'>> = [
  { primary: '#0e3b24', secondary: '#d6f25c', ink: '#f4fff4' },
  { primary: '#14284a', secondary: '#e2c16b', ink: '#f7f4ea' },
  { primary: '#6e1d2a', secondary: '#f3d7a1', ink: '#fff8f3' },
  { primary: '#1a3658', secondary: '#ef6a3c', ink: '#f5f9ff' },
  { primary: '#1e3a2f', secondary: '#7dcea0', ink: '#f3fff8' },
  { primary: '#2c2148', secondary: '#d7b4ff', ink: '#f8f4ff' },
  { primary: '#3d2a14', secondary: '#f0c14a', ink: '#fff8ea' },
  { primary: '#0f3d4c', secondary: '#7fd3e0', ink: '#f2fcff' },
  { primary: '#3a1d2e', secondary: '#f2a3c2', ink: '#fff5f8' },
  { primary: '#1b2e22', secondary: '#b7e36a', ink: '#f6ffea' },
  { primary: '#242833', secondary: '#f08a3c', ink: '#f7f8fb' },
  { primary: '#16324a', secondary: '#f2efe4', ink: '#f4f8fc' },
  { primary: '#4a1c1c', secondary: '#f0d2a0', ink: '#fff6f2' },
  { primary: '#0f2f3a', secondary: '#e0b15a', ink: '#f3fbfd' },
  { primary: '#243018', secondary: '#e7ef9a', ink: '#f7fbea' },
  { primary: '#2a1f3d', secondary: '#f0c36a', ink: '#f8f4ff' },
  { primary: '#12352e', secondary: '#f28b6a', ink: '#f3fffb' },
  { primary: '#1c2744', secondary: '#8eb6ff', ink: '#f4f7ff' },
  { primary: '#3e2418', secondary: '#f2c14e', ink: '#fff7ef' },
  { primary: '#1a2f24', secondary: '#ffffff', ink: '#f4fff8' },
  { primary: '#2d1a33', secondary: '#e7a0ff', ink: '#fbf4ff' },
  { primary: '#102818', secondary: '#9be7c4', ink: '#f2fff8' },
  { primary: '#3a2218', secondary: '#f6d7a8', ink: '#fff8f2' },
  { primary: '#15283f', secondary: '#f26d5b', ink: '#f4f8ff' },
  { primary: '#1f2a18', secondary: '#d5e26a', ink: '#f7fbe8' },
  { primary: '#2b2438', secondary: '#c9b7ff', ink: '#f7f5ff' },
  { primary: '#0e3330', secondary: '#f0e2a8', ink: '#f2fffc' },
  { primary: '#3d1e28', secondary: '#f2b4a0', ink: '#fff5f4' },
  { primary: '#1a3048', secondary: '#7ed0c8', ink: '#f3f9ff' },
  { primary: '#2e2614', secondary: '#f2d56b', ink: '#fffaf0' },
  { primary: '#14261c', secondary: '#c8f07a', ink: '#f4fff6' },
  { primary: '#2a1c24', secondary: '#f0c2d4', ink: '#fff6fa' },
];

function words(schoolName: string): string[] {
  return schoolName
    .replace(/A&M/gi, 'AM')
    .replace(/&/g, ' ')
    .replace(/[^A-Za-z\s]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word && !STOP_WORDS.has(word.toLowerCase()));
}

export function letterOptions(schoolName: string): string[] {
  const parts = words(schoolName).map((word) => word.toUpperCase());
  const options: string[] = [];
  const push = (value: string) => {
    const next = value.replace(/[^A-Z]/g, '').slice(0, 4);
    if (next.length >= 2 && !options.includes(next)) options.push(next);
  };

  if (parts.length === 0) {
    push('TM');
  } else if (parts.length === 1) {
    const [word] = parts;
    push(word.slice(0, 4));
    push(word.slice(0, 3));
    push(word.slice(0, 2));
  } else if (parts.length === 2) {
    const [first, second] = parts;
    push(first.slice(0, 2) + second.slice(0, 2));
    push(first.slice(0, 3) + second.slice(0, 1));
    push(first.slice(0, 1) + second.slice(0, 3));
    push(first.slice(0, 4));
    push(`${first[0] ?? ''}${second[0] ?? ''}`);
  } else {
    push(parts.map((word) => word[0] ?? '').join(''));
    push(parts[0].slice(0, 2) + parts[1].slice(0, 2));
    push(parts[0].slice(0, 3) + (parts[1][0] ?? ''));
    push(parts[0].slice(0, 4));
  }

  return options;
}

function assignLetters(teams: Array<{ id: string; schoolName: string }>): Map<string, string> {
  const taken = new Set<string>();
  const assigned = new Map<string, string>();
  const ordered = [...teams].sort((a, b) => a.schoolName.localeCompare(b.schoolName) || a.id.localeCompare(b.id));

  for (const team of ordered) {
    const options = letterOptions(team.schoolName);
    const open = options.find((option) => !taken.has(option));
    let letters = open;
    if (!letters) {
      const base = options[0] ?? 'TM';
      for (let suffix = 2; suffix <= 9; suffix += 1) {
        const next = `${base.slice(0, 3)}${suffix}`;
        if (!taken.has(next)) {
          letters = next;
          break;
        }
      }
    }
    const finalLetters = letters ?? 'TM';
    taken.add(finalLetters);
    assigned.set(team.id, finalLetters);
  }

  return assigned;
}

const LETTERS = assignLetters(teamsData.teams);

function colorFor(id: string): Pick<TeamMark, 'primary' | 'secondary' | 'ink'> {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return COLORS[(hash >>> 0) % COLORS.length];
}

export function teamMark(team: { id: string; schoolName: string }): TeamMark {
  const colors = colorFor(team.id);
  return {
    letters: LETTERS.get(team.id) ?? letterOptions(team.schoolName)[0] ?? 'TM',
    ...colors,
  };
}
