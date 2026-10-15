export const SERVER_URL: string = 'https://love.11215739.xyz:11961/';
export const VERSION_CODE: number = 10813;
export const VERSION_NAME: string = '1.8.0';

// Match the complete HTTPS origin, including the non-default server port.
export function trusted(value: string): boolean {
  const origin: string = SERVER_URL.slice(0, -1);
  return value === origin || value.startsWith(origin + '/') || value.startsWith(origin + '?') || value.startsWith(origin + '#');
}

export function commandPath(value: string): string {
  if (!trusted(value)) return '';
  return value.slice(SERVER_URL.length - 1).split('?')[0].split('#')[0];
}
