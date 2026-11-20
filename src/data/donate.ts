// RU: Кошельки для доната в USDT. Единственное место, где хранятся адреса: окно доната и тест
//     берут их отсюда. Адреса дал Valentin (2026-11-20). Менять только по его слову и сверять
//     побуквенно: ошибка в одном символе отправит деньги на чужой кошелёк.
// EN: USDT donation wallets. The only place the addresses live: the donate window and the test
//     read them from here. Addresses provided by Valentin (2026-11-20). Change them only on his
//     word and check every character: one wrong symbol sends the money to someone else.

export type DonateNetworkId = 'tron' | 'solana' | 'ethereum' | 'arbitrum' | 'avalanche';

export interface DonateNetwork {
  id: DonateNetworkId;
  // Название сети, как его показывают кошельки и биржи. / Network name as wallets and exchanges show it.
  label: string;
  // Стандарт токена USDT в этой сети. / USDT token standard on this network.
  standard: string;
  address: string;
}

const SOLANA_ADDRESS = 'DFV4HD6SCkFTEvtf5xU1mB7DTE5cKMBBHGftpLFWPG1s';
// Один адрес на Arbitrum, Avalanche и Ethereum. / One address for Arbitrum, Avalanche and Ethereum.
const EVM_ADDRESS = '0x2a959B2f486e7F1d033016A7c94796cF42e1eF0f';
const TRON_ADDRESS = 'TJZJ6wqa3DSmN4JT4ndqYx2MGpqdsVxTE1';

export const DONATE_NETWORKS: readonly DonateNetwork[] = [
  { id: 'tron', label: 'Tron', standard: 'TRC-20', address: TRON_ADDRESS },
  { id: 'solana', label: 'Solana', standard: 'SPL', address: SOLANA_ADDRESS },
  { id: 'arbitrum', label: 'Arbitrum One', standard: 'ERC-20', address: EVM_ADDRESS },
  { id: 'avalanche', label: 'Avalanche C-Chain', standard: 'ERC-20', address: EVM_ADDRESS },
  { id: 'ethereum', label: 'Ethereum', standard: 'ERC-20', address: EVM_ADDRESS },
];

export const DONATE_TOKEN = 'USDT';
export const DONATE_PRESET_AMOUNTS: readonly number[] = [2, 5, 10];

// Своя сумма: число больше нуля, не больше 6 знаков после точки (точность USDT), запятая тоже годится.
// Возвращает нормализованную строку или null.
// Custom amount: a number above zero with at most 6 decimals (USDT precision); a comma works too.
// Returns a normalized string or null.
export function parseDonateAmount(raw: string): string | null {
  const s = raw.trim().replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return s.replace(/^0+(?=\d)/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}
