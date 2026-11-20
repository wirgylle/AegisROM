// Справочник BIOS для новичков: какой консоли что нужно, куда класть и где законно взять.
// BIOS guide for newcomers: what each console needs, where to put it and how to get it legally.
//
// Имена файлов совпадают с RetroArch system/ (libretro System.dat), хеши берутся оттуда же.
// File names follow RetroArch system/ (libretro System.dat); hashes come from the same DAT.
// AegisROM не распространяет BIOS и не ссылается на сайты, которые их раздают.
// AegisROM does not distribute BIOS files and does not link to sites that share them.

export type BiosNeed = 'required' | 'recommended' | 'optional' | 'none';
export type BiosLang = 'ru' | 'en' | 'de' | 'es' | 'fr' | 'it' | 'ja' | 'zh' | 'sr';
export type LocalizedText = Record<BiosLang, string>;

export interface BiosGuideGroup {
  /** required — без этого игры не запустятся; optional — улучшает совместимость. */
  level: 'required' | 'optional';
  /**
   * any — достаточно одного файла из списка (обычно один на регион);
   * all — нужны все файлы;
   * anyFromSystem — имя файла не важно, подойдёт любой известный дамп этой системы (PS2, GameCube).
   */
  mode: 'any' | 'all' | 'anyFromSystem';
  /** Пути относительно system/ (как в System.dat). */
  files: string[];
  /** Регион или пометка к файлу (по индексу files). */
  regions?: string[];
}

export interface BiosGuideEmulator {
  name: string;
  need: BiosNeed;
  /** Куда положить файлы в этом эмуляторе (пути и пункты меню не переводятся). */
  where: string;
}

export interface BiosGuideLink {
  kind: 'docs' | 'dump' | 'official' | 'free';
  label: string;
  url: string;
}

export interface BiosGuideSystem {
  id: string;
  name: string;
  /** Имя системы в libretro System.dat (для поиска хешей). */
  datSystem?: string;
  /** Ключи консолей AegisROM (после normalizeConsoleKeyForEmulator / normalizeBiosConsoleKey). */
  consoleKeys: string[];
  need: BiosNeed;
  /** Зачем BIOS этой консоли, коротко и человеческим языком. */
  why: LocalizedText;
  groups: BiosGuideGroup[];
  emulators: BiosGuideEmulator[];
  links: BiosGuideLink[];
}

const RA_SYSTEM = 'RetroArch: system/';
const DOCS = (core: string, label: string): BiosGuideLink => ({
  kind: 'docs',
  label,
  url: `https://docs.libretro.com/library/${core}/`,
});

export const LIBRETRO_BIOS_GUIDE_URL = 'https://docs.libretro.com/guides/bios/';
/** Пошаговый гайд по дампу BIOS PS1 и PS2 со своей консоли. */
export const PS_DUMP_GUIDE_URL = 'https://retrogamecorps.com/2023/02/17/ps2-and-ps1-bios-extraction-guide/';

export const BIOS_GUIDE: BiosGuideSystem[] = [
  {
    id: 'psx',
    name: 'Sony PlayStation (PS1)',
    datSystem: 'Sony - PlayStation',
    consoleKeys: ['psx'],
    need: 'recommended',
    why: {
      ru: 'BIOS — встроенная программа приставки: заставка, карты памяти, запуск диска. DuckStation без него не запустит игру. Ядра RetroArch стартуют на замене (HLE/OpenBIOS), но часть игр виснет или теряет сохранения.',
      en: 'The BIOS is the console’s built-in program: boot logo, memory cards, disc start-up. DuckStation will not start games without it. RetroArch cores fall back to a replacement (HLE/OpenBIOS), but some games freeze or lose saves.',
      de: 'Das BIOS ist das eingebaute Programm der Konsole: Startlogo, Memory Cards, Disc-Start. DuckStation startet ohne BIOS keine Spiele. RetroArch-Cores nutzen einen Ersatz (HLE/OpenBIOS), manche Spiele hängen dann oder verlieren Spielstände.',
      es: 'La BIOS es el programa interno de la consola: logo de arranque, memory cards, inicio del disco. DuckStation no inicia juegos sin ella. Los núcleos de RetroArch usan un sustituto (HLE/OpenBIOS), pero algunos juegos se cuelgan o pierden partidas.',
      fr: 'Le BIOS est le programme interne de la console : logo de démarrage, cartes mémoire, lancement du disque. DuckStation ne lance aucun jeu sans lui. Les cœurs RetroArch utilisent un remplaçant (HLE/OpenBIOS), mais certains jeux plantent ou perdent leurs sauvegardes.',
      it: 'Il BIOS è il programma interno della console: logo di avvio, memory card, avvio del disco. DuckStation non avvia giochi senza BIOS. I core RetroArch usano un sostituto (HLE/OpenBIOS), ma alcuni giochi si bloccano o perdono i salvataggi.',
      ja: 'BIOSは本体に内蔵されたプログラムで、起動ロゴ・メモリーカード・ディスク起動を担当します。DuckStationはBIOSがないとゲームを起動できません。RetroArchのコアは代替(HLE/OpenBIOS)で動きますが、一部のゲームが止まったりセーブが消えたりします。',
      zh: 'BIOS 是主机内置的程序：开机画面、记忆卡、光盘启动。没有它 DuckStation 无法启动游戏。RetroArch 核心会用替代品（HLE/OpenBIOS）运行，但部分游戏会卡死或丢失存档。',
      sr: 'BIOS je ugrađeni program konzole: logo pri pokretanju, memorijske kartice, pokretanje diska. DuckStation bez njega ne pokreće igre. RetroArch jezgra koriste zamenu (HLE/OpenBIOS), ali neke igre se zaglave ili gube sačuvane pozicije.',
    },
    groups: [
      {
        level: 'required',
        mode: 'any',
        files: ['scph5501.bin', 'scph5500.bin', 'scph5502.bin', 'scph1001.bin', 'scph7001.bin', 'scph101.bin', 'psxonpsp660.bin'],
        regions: ['USA', 'Japan', 'Europe', 'USA', 'USA', 'USA', 'PSP'],
      },
    ],
    emulators: [
      { name: 'DuckStation', need: 'required', where: 'Settings → BIOS → BIOS Directory' },
      { name: 'Beetle PSX / Beetle PSX HW', need: 'recommended', where: RA_SYSTEM },
      { name: 'PCSX ReARMed', need: 'optional', where: RA_SYSTEM },
    ],
    links: [
      { kind: 'dump', label: 'PS1 / PS2 BIOS dump guide', url: PS_DUMP_GUIDE_URL },
      { kind: 'free', label: 'OpenBIOS (PCSX-Redux)', url: 'https://pcsx-redux.consoledev.net/openbios/' },
      DOCS('beetle_psx_hw', 'Beetle PSX HW'),
      DOCS('pcsx_rearmed', 'PCSX ReARMed'),
    ],
  },
  {
    id: 'ps2',
    name: 'Sony PlayStation 2',
    datSystem: 'Sony - PlayStation 2',
    consoleKeys: ['ps2'],
    need: 'required',
    why: {
      ru: 'PCSX2 и LRPS2 не работают без BIOS PS2: в нём операционная система приставки. Имя файла не важно, эмулятор сам найдёт дамп в папке. Нужен цельный файл 4 МБ, не в архиве.',
      en: 'PCSX2 and LRPS2 do not run without a PS2 BIOS: it holds the console’s operating system. The file name does not matter, the emulator finds the dump in the folder. Use the full 4 MB file, not a zip.',
      de: 'PCSX2 und LRPS2 laufen nicht ohne PS2-BIOS: Es enthält das Betriebssystem der Konsole. Der Dateiname ist egal, der Emulator findet den Dump im Ordner. Nötig ist die volle 4-MB-Datei, nicht gezippt.',
      es: 'PCSX2 y LRPS2 no funcionan sin la BIOS de PS2: contiene el sistema operativo de la consola. El nombre del archivo da igual, el emulador encuentra el volcado en la carpeta. Usa el archivo completo de 4 MB, sin comprimir.',
      fr: 'PCSX2 et LRPS2 ne fonctionnent pas sans BIOS PS2 : il contient le système de la console. Le nom du fichier importe peu, l’émulateur trouve le dump dans le dossier. Utilisez le fichier complet de 4 Mo, non compressé.',
      it: 'PCSX2 e LRPS2 non funzionano senza BIOS PS2: contiene il sistema operativo della console. Il nome del file non conta, l’emulatore trova il dump nella cartella. Serve il file intero da 4 MB, non zippato.',
      ja: 'PCSX2とLRPS2はPS2 BIOSがないと動きません。本体のOSが入っているためです。ファイル名は自由で、エミュレーターがフォルダー内のダンプを探します。ZIPではなく4MBのファイルそのままを使ってください。',
      zh: '没有 PS2 BIOS，PCSX2 和 LRPS2 无法运行：它包含主机的操作系统。文件名无所谓，模拟器会在文件夹中找到转储。请使用完整的 4 MB 文件，不要压缩。',
      sr: 'PCSX2 i LRPS2 ne rade bez PS2 BIOS-a: u njemu je operativni sistem konzole. Ime fajla nije bitno, emulator sam nalazi dump u folderu. Potreban je ceo fajl od 4 MB, ne u arhivi.',
    },
    groups: [{ level: 'required', mode: 'anyFromSystem', files: ['pcsx2/bios/ps2-0230a-20080220.bin'] }],
    emulators: [
      { name: 'PCSX2', need: 'required', where: 'Settings → BIOS (Documents/PCSX2/bios)' },
      { name: 'LRPS2 (RetroArch)', need: 'required', where: 'RetroArch: system/pcsx2/bios/' },
    ],
    links: [
      { kind: 'dump', label: 'PCSX2: Gathering Files (BIOS dump)', url: 'https://pcsx2.net/docs/setup/gather' },
      { kind: 'dump', label: 'PS1 / PS2 BIOS dump guide', url: PS_DUMP_GUIDE_URL },
      DOCS('lrps2', 'LRPS2'),
    ],
  },
  {
    id: 'segacd',
    name: 'Sega Mega-CD / Sega CD',
    datSystem: 'Sega - Mega CD - Sega CD',
    consoleKeys: ['segacd', 'megacd'],
    need: 'required',
    why: {
      ru: 'Обычные картриджи Mega Drive BIOS не требуют, а диски Mega-CD без него не загрузятся: он управляет приводом. Положите файл того региона, что и игры.',
      en: 'Regular Mega Drive cartridges need no BIOS, but Mega-CD discs will not boot without it: it drives the CD unit. Use the file for the same region as your games.',
      de: 'Normale Mega-Drive-Module brauchen kein BIOS, Mega-CD-Discs starten ohne es aber nicht: Es steuert das Laufwerk. Nimm die Datei für die Region deiner Spiele.',
      es: 'Los cartuchos de Mega Drive no necesitan BIOS, pero los discos de Mega-CD no arrancan sin ella: controla la unidad de CD. Usa el archivo de la misma región que tus juegos.',
      fr: 'Les cartouches Mega Drive n’ont pas besoin de BIOS, mais les disques Mega-CD ne démarrent pas sans lui : il pilote le lecteur. Prenez le fichier de la même région que vos jeux.',
      it: 'Le cartucce Mega Drive non richiedono BIOS, ma i dischi Mega-CD non partono senza: gestisce il lettore. Usa il file della stessa regione dei giochi.',
      ja: '通常のメガドライブのカートリッジにBIOSは不要ですが、メガCDのディスクはBIOSがないと起動しません。CDユニットを動かすためです。ゲームと同じ地域のファイルを使ってください。',
      zh: '普通 Mega Drive 卡带不需要 BIOS，但 Mega-CD 光盘没有它无法启动：它负责驱动光驱。请使用与游戏相同地区的文件。',
      sr: 'Obični Mega Drive kertridži ne traže BIOS, ali Mega-CD diskovi se bez njega ne pokreću: on upravlja CD jedinicom. Koristite fajl za isti region kao igre.',
    },
    groups: [
      {
        level: 'required',
        mode: 'any',
        files: ['bios_CD_U.bin', 'bios_CD_E.bin', 'bios_CD_J.bin'],
        regions: ['USA', 'Europe', 'Japan'],
      },
    ],
    emulators: [
      { name: 'Genesis Plus GX', need: 'required', where: RA_SYSTEM },
      { name: 'PicoDrive', need: 'required', where: RA_SYSTEM },
    ],
    links: [DOCS('genesis_plus_gx', 'Genesis Plus GX'), DOCS('picodrive', 'PicoDrive')],
  },
  {
    id: 'saturn',
    name: 'Sega Saturn',
    datSystem: 'Sega - Saturn',
    consoleKeys: ['saturn'],
    need: 'required',
    why: {
      ru: 'Beetle Saturn и Kronos без BIOS не запускают игры. Для японских игр нужен sega_101.bin, для американских и европейских — mpr-17933.bin. Yabause умеет работать на замене, но с ошибками.',
      en: 'Beetle Saturn and Kronos will not start games without a BIOS. Japanese games need sega_101.bin, US and European games need mpr-17933.bin. Yabause can use a replacement, but with glitches.',
      de: 'Beetle Saturn und Kronos starten ohne BIOS keine Spiele. Japanische Spiele brauchen sega_101.bin, US- und EU-Spiele mpr-17933.bin. Yabause läuft auch mit Ersatz, aber fehlerhaft.',
      es: 'Beetle Saturn y Kronos no inician juegos sin BIOS. Los juegos japoneses necesitan sega_101.bin; los de EE. UU. y Europa, mpr-17933.bin. Yabause puede usar un sustituto, pero con fallos.',
      fr: 'Beetle Saturn et Kronos ne lancent aucun jeu sans BIOS. Les jeux japonais demandent sega_101.bin, les jeux US et européens mpr-17933.bin. Yabause peut utiliser un remplaçant, avec des bugs.',
      it: 'Beetle Saturn e Kronos non avviano giochi senza BIOS. I giochi giapponesi richiedono sega_101.bin, quelli USA ed europei mpr-17933.bin. Yabause può usare un sostituto, ma con difetti.',
      ja: 'Beetle SaturnとKronosはBIOSがないとゲームを起動しません。日本のゲームにはsega_101.bin、北米・欧州のゲームにはmpr-17933.binが必要です。Yabauseは代替でも動きますが不具合があります。',
      zh: '没有 BIOS，Beetle Saturn 和 Kronos 无法启动游戏。日版游戏需要 sega_101.bin，美版和欧版需要 mpr-17933.bin。Yabause 可以用替代品，但会有问题。',
      sr: 'Beetle Saturn i Kronos bez BIOS-a ne pokreću igre. Japanske igre traže sega_101.bin, američke i evropske mpr-17933.bin. Yabause može da radi sa zamenom, ali sa greškama.',
    },
    groups: [
      { level: 'required', mode: 'any', files: ['mpr-17933.bin', 'sega_101.bin'], regions: ['USA / Europe', 'Japan'] },
      { level: 'optional', mode: 'any', files: ['kronos/saturn_bios.bin'], regions: ['Kronos'] },
    ],
    emulators: [
      { name: 'Beetle Saturn', need: 'required', where: RA_SYSTEM },
      { name: 'Kronos', need: 'required', where: 'RetroArch: system/kronos/' },
      { name: 'Yabause / YabaSanshiro', need: 'optional', where: RA_SYSTEM },
    ],
    links: [DOCS('beetle_saturn', 'Beetle Saturn'), DOCS('kronos', 'Kronos')],
  },
  {
    id: 'dreamcast',
    name: 'Sega Dreamcast',
    datSystem: 'Sega - Dreamcast',
    consoleKeys: ['dreamcast'],
    need: 'recommended',
    why: {
      ru: 'Flycast умеет запускать игры на встроенной замене BIOS, но с настоящим BIOS выше совместимость, работают часы и системное меню. Файлы кладутся в подпапку dc/.',
      en: 'Flycast can run games on its built-in BIOS replacement, but the real BIOS gives better compatibility, the clock and the system menu. The files go into the dc/ subfolder.',
      de: 'Flycast startet Spiele auch mit eingebautem BIOS-Ersatz, das echte BIOS bringt aber bessere Kompatibilität, Uhr und Systemmenü. Die Dateien kommen in den Unterordner dc/.',
      es: 'Flycast puede ejecutar juegos con su sustituto de BIOS integrado, pero la BIOS real da mejor compatibilidad, reloj y menú del sistema. Los archivos van en la subcarpeta dc/.',
      fr: 'Flycast peut lancer les jeux avec son BIOS de remplacement intégré, mais le vrai BIOS améliore la compatibilité et donne l’horloge et le menu système. Les fichiers vont dans le sous-dossier dc/.',
      it: 'Flycast può avviare i giochi con il sostituto BIOS integrato, ma il BIOS reale dà più compatibilità, orologio e menu di sistema. I file vanno nella sottocartella dc/.',
      ja: 'Flycastは内蔵の代替BIOSでもゲームを起動できますが、本物のBIOSのほうが互換性が高く、時計やシステムメニューも使えます。ファイルはdc/サブフォルダーに入れます。',
      zh: 'Flycast 可以用内置的替代 BIOS 运行游戏，但真实 BIOS 兼容性更好，并支持时钟和系统菜单。文件放在 dc/ 子文件夹中。',
      sr: 'Flycast može da pokreće igre na ugrađenoj zameni za BIOS, ali pravi BIOS daje bolju kompatibilnost, sat i sistemski meni. Fajlovi idu u podfolder dc/.',
    },
    groups: [
      { level: 'required', mode: 'any', files: ['dc/dc_boot.bin', 'dc/boot.bin'] },
      { level: 'optional', mode: 'any', files: ['dc/flash.bin'] },
    ],
    emulators: [
      { name: 'Flycast (RetroArch)', need: 'recommended', where: 'RetroArch: system/dc/' },
      { name: 'Flycast', need: 'recommended', where: 'data/ (Settings → General)' },
    ],
    links: [DOCS('flycast', 'Flycast')],
  },
  {
    id: 'gba',
    name: 'Nintendo Game Boy Advance',
    datSystem: 'Nintendo - Game Boy Advance',
    consoleKeys: ['gba'],
    need: 'optional',
    why: {
      ru: 'mGBA и gpSP работают без BIOS. Настоящий BIOS добавляет заставку при запуске и исправляет редкие ошибки в отдельных играх. В mGBA включите опцию «Use BIOS file if found».',
      en: 'mGBA and gpSP run without a BIOS. The real BIOS adds the boot logo and fixes rare issues in a few games. In mGBA, turn on the “Use BIOS file if found” option.',
      de: 'mGBA und gpSP laufen ohne BIOS. Das echte BIOS zeigt das Startlogo und behebt seltene Fehler in einzelnen Spielen. In mGBA die Option „Use BIOS file if found“ einschalten.',
      es: 'mGBA y gpSP funcionan sin BIOS. La BIOS real añade el logo de arranque y corrige fallos raros en algunos juegos. En mGBA activa la opción «Use BIOS file if found».',
      fr: 'mGBA et gpSP fonctionnent sans BIOS. Le vrai BIOS ajoute le logo de démarrage et corrige de rares bugs dans quelques jeux. Dans mGBA, activez l’option « Use BIOS file if found ».',
      it: 'mGBA e gpSP funzionano senza BIOS. Il BIOS reale aggiunge il logo di avvio e corregge rari problemi in alcuni giochi. In mGBA attiva l’opzione «Use BIOS file if found».',
      ja: 'mGBAとgpSPはBIOSなしで動きます。本物のBIOSを使うと起動ロゴが表示され、一部のゲームのまれな不具合が直ります。mGBAでは「Use BIOS file if found」をオンにします。',
      zh: 'mGBA 和 gpSP 不需要 BIOS 也能运行。真实 BIOS 会显示开机画面，并修复少数游戏的罕见问题。在 mGBA 中请开启“Use BIOS file if found”选项。',
      sr: 'mGBA i gpSP rade bez BIOS-a. Pravi BIOS dodaje logo pri pokretanju i ispravlja retke greške u pojedinim igrama. U mGBA uključite opciju „Use BIOS file if found“.',
    },
    groups: [{ level: 'optional', mode: 'any', files: ['gba_bios.bin'] }],
    emulators: [
      { name: 'mGBA', need: 'optional', where: RA_SYSTEM },
      { name: 'gpSP', need: 'optional', where: RA_SYSTEM },
    ],
    links: [DOCS('mgba', 'mGBA'), DOCS('gpsp', 'gpSP')],
  },
  {
    id: 'nds',
    name: 'Nintendo DS',
    datSystem: 'Nintendo - Nintendo DS',
    consoleKeys: ['nds'],
    need: 'optional',
    why: {
      ru: 'melonDS и DeSmuME запускают игры DS на встроенной свободной замене BIOS. Настоящие bios7.bin, bios9.bin и firmware.bin нужны для системного меню, Wi-Fi и режима DSi (там они обязательны).',
      en: 'melonDS and DeSmuME run DS games on a built-in free BIOS replacement. The real bios7.bin, bios9.bin and firmware.bin are needed for the system menu, Wi-Fi and DSi mode (required there).',
      de: 'melonDS und DeSmuME starten DS-Spiele mit eingebautem freiem BIOS-Ersatz. Die echten bios7.bin, bios9.bin und firmware.bin braucht man für Systemmenü, WLAN und den DSi-Modus (dort Pflicht).',
      es: 'melonDS y DeSmuME ejecutan juegos de DS con un sustituto libre de BIOS integrado. Los bios7.bin, bios9.bin y firmware.bin reales hacen falta para el menú del sistema, el Wi-Fi y el modo DSi (ahí son obligatorios).',
      fr: 'melonDS et DeSmuME lancent les jeux DS avec un BIOS libre de remplacement intégré. Les vrais bios7.bin, bios9.bin et firmware.bin servent au menu système, au Wi-Fi et au mode DSi (obligatoires dans ce cas).',
      it: 'melonDS e DeSmuME avviano i giochi DS con un sostituto BIOS libero integrato. I veri bios7.bin, bios9.bin e firmware.bin servono per il menu di sistema, il Wi-Fi e la modalità DSi (lì sono obbligatori).',
      ja: 'melonDSとDeSmuMEは内蔵のフリーな代替BIOSでDSのゲームを動かせます。本物のbios7.bin・bios9.bin・firmware.binは、本体メニュー、Wi-Fi、DSiモード(必須)で必要です。',
      zh: 'melonDS 和 DeSmuME 使用内置的免费替代 BIOS 运行 DS 游戏。真实的 bios7.bin、bios9.bin 和 firmware.bin 用于系统菜单、Wi-Fi 和 DSi 模式（DSi 模式必需）。',
      sr: 'melonDS i DeSmuME pokreću DS igre na ugrađenoj slobodnoj zameni za BIOS. Pravi bios7.bin, bios9.bin i firmware.bin trebaju za sistemski meni, Wi-Fi i DSi režim (tamo su obavezni).',
    },
    groups: [
      { level: 'optional', mode: 'all', files: ['bios7.bin', 'bios9.bin', 'firmware.bin'] },
    ],
    emulators: [
      { name: 'melonDS', need: 'optional', where: 'Config → Emu settings → DS-mode' },
      { name: 'melonDS DS (RetroArch)', need: 'optional', where: RA_SYSTEM },
      { name: 'DeSmuME', need: 'optional', where: RA_SYSTEM },
    ],
    links: [
      { kind: 'dump', label: 'DS-Homebrew: BIOS/Firmware Dumping', url: 'https://wiki.ds-homebrew.com/ds-index/ds-bios-firmware-dump' },
      { kind: 'docs', label: 'melonDS FAQ', url: 'https://melonds.kuribo64.net/faq.php' },
      DOCS('melonds_ds', 'melonDS DS'),
    ],
  },
  {
    id: 'fds',
    name: 'Famicom Disk System',
    datSystem: 'Nintendo - Famicom Disk System',
    consoleKeys: ['fds'],
    need: 'required',
    why: {
      ru: 'Игры NES/Famicom на картриджах работают без BIOS. Дискеты Famicom Disk System (.fds) без disksys.rom не запустятся.',
      en: 'NES/Famicom cartridges run without a BIOS. Famicom Disk System floppies (.fds) will not start without disksys.rom.',
      de: 'NES-/Famicom-Module laufen ohne BIOS. Famicom-Disk-System-Disketten (.fds) starten nicht ohne disksys.rom.',
      es: 'Los cartuchos de NES/Famicom funcionan sin BIOS. Los disquetes de Famicom Disk System (.fds) no arrancan sin disksys.rom.',
      fr: 'Les cartouches NES/Famicom fonctionnent sans BIOS. Les disquettes Famicom Disk System (.fds) ne démarrent pas sans disksys.rom.',
      it: 'Le cartucce NES/Famicom funzionano senza BIOS. I dischetti Famicom Disk System (.fds) non partono senza disksys.rom.',
      ja: 'ファミコンのカートリッジはBIOS不要です。ディスクシステム(.fds)はdisksys.romがないと起動しません。',
      zh: 'NES/Famicom 卡带不需要 BIOS。Famicom 磁碟机（.fds）游戏没有 disksys.rom 无法启动。',
      sr: 'NES/Famicom kertridži rade bez BIOS-a. Famicom Disk System diskete (.fds) se ne pokreću bez disksys.rom.',
    },
    groups: [{ level: 'required', mode: 'any', files: ['disksys.rom'] }],
    emulators: [
      { name: 'Mesen', need: 'required', where: RA_SYSTEM },
      { name: 'FCEUmm / Nestopia', need: 'required', where: RA_SYSTEM },
    ],
    links: [DOCS('mesen', 'Mesen'), DOCS('fceumm', 'FCEUmm')],
  },
  {
    id: 'pcecd',
    name: 'PC Engine CD / TurboGrafx-CD',
    datSystem: 'NEC - PC Engine - TurboGrafx 16 - SuperGrafx',
    consoleKeys: ['pcenginecd', 'pcecd', 'tgcd'],
    need: 'required',
    why: {
      ru: 'Карточки HuCard PC Engine работают без BIOS. Для CD-игр нужна системная карта: syscard3.pce подходит почти ко всем дискам.',
      en: 'PC Engine HuCards run without a BIOS. CD games need a System Card: syscard3.pce works for almost every disc.',
      de: 'PC-Engine-HuCards laufen ohne BIOS. CD-Spiele brauchen eine System Card: syscard3.pce passt zu fast allen Discs.',
      es: 'Las HuCard de PC Engine funcionan sin BIOS. Los juegos en CD necesitan una System Card: syscard3.pce sirve para casi todos los discos.',
      fr: 'Les HuCard PC Engine fonctionnent sans BIOS. Les jeux CD exigent une System Card : syscard3.pce convient à presque tous les disques.',
      it: 'Le HuCard PC Engine funzionano senza BIOS. I giochi su CD richiedono una System Card: syscard3.pce va bene per quasi tutti i dischi.',
      ja: 'PCエンジンのHuカードはBIOS不要です。CD-ROM²のゲームにはシステムカードが必要で、syscard3.pceならほぼすべてのディスクが動きます。',
      zh: 'PC Engine 的 HuCard 卡带不需要 BIOS。CD 游戏需要系统卡：syscard3.pce 几乎适用于所有光盘。',
      sr: 'PC Engine HuCard kartice rade bez BIOS-a. CD igre traže System Card: syscard3.pce radi za skoro sve diskove.',
    },
    groups: [
      { level: 'required', mode: 'any', files: ['syscard3.pce', 'syscard3u.pce'], regions: ['Japan', 'USA'] },
      { level: 'optional', mode: 'any', files: ['gexpress.pce'], regions: ['Games Express'] },
    ],
    emulators: [{ name: 'Beetle PCE FAST / Beetle PCE', need: 'required', where: RA_SYSTEM }],
    links: [DOCS('beetle_pce_fast', 'Beetle PCE FAST')],
  },
  {
    id: 'arcade',
    name: 'Arcade (FBNeo / MAME) — Neo Geo, PGM',
    datSystem: 'Arcade',
    consoleKeys: ['arcade', 'neogeo'],
    need: 'required',
    why: {
      ru: 'Большинство аркадных игр BIOS не требуют. Игры Neo Geo запускаются только с neogeo.zip, игры PGM — с pgm.zip. Архив кладут без распаковки в system/fbneo/ или рядом с ромами. Версия BIOS должна подходить к версии FBNeo.',
      en: 'Most arcade games need no BIOS. Neo Geo games only start with neogeo.zip, PGM games with pgm.zip. Keep the zip as is, in system/fbneo/ or next to the ROMs. The BIOS set must match your FBNeo version.',
      de: 'Die meisten Arcade-Spiele brauchen kein BIOS. Neo-Geo-Spiele starten nur mit neogeo.zip, PGM-Spiele mit pgm.zip. Das ZIP nicht entpacken, in system/fbneo/ oder neben die ROMs legen. Das BIOS-Set muss zur FBNeo-Version passen.',
      es: 'La mayoría de juegos arcade no necesitan BIOS. Los de Neo Geo solo arrancan con neogeo.zip y los de PGM con pgm.zip. Deja el zip sin descomprimir en system/fbneo/ o junto a las ROMs. El set de BIOS debe coincidir con tu versión de FBNeo.',
      fr: 'La plupart des jeux d’arcade n’ont pas besoin de BIOS. Les jeux Neo Geo ne démarrent qu’avec neogeo.zip, les jeux PGM avec pgm.zip. Gardez le zip tel quel, dans system/fbneo/ ou à côté des ROM. Le set BIOS doit correspondre à votre version de FBNeo.',
      it: 'La maggior parte dei giochi arcade non richiede BIOS. I giochi Neo Geo partono solo con neogeo.zip, quelli PGM con pgm.zip. Lascia lo zip com’è, in system/fbneo/ o accanto alle ROM. Il set BIOS deve corrispondere alla versione di FBNeo.',
      ja: 'ほとんどのアーケードゲームにBIOSは不要です。ネオジオのゲームはneogeo.zip、PGMのゲームはpgm.zipがないと起動しません。ZIPは解凍せずsystem/fbneo/かROMと同じフォルダーに置きます。BIOSセットはFBNeoのバージョンに合わせてください。',
      zh: '大多数街机游戏不需要 BIOS。Neo Geo 游戏必须有 neogeo.zip，PGM 游戏需要 pgm.zip。压缩包不要解压，放在 system/fbneo/ 或 ROM 旁边。BIOS 套件需与 FBNeo 版本匹配。',
      sr: 'Većina arkadnih igara ne traži BIOS. Neo Geo igre se pokreću samo uz neogeo.zip, PGM igre uz pgm.zip. Arhivu ne raspakujte, stavite je u system/fbneo/ ili pored romova. BIOS set mora odgovarati verziji FBNeo.',
    },
    groups: [
      { level: 'required', mode: 'any', files: ['fbneo/neogeo.zip', 'neogeo.zip'], regions: ['Neo Geo', 'Neo Geo'] },
      { level: 'optional', mode: 'any', files: ['fbneo/pgm.zip'], regions: ['PGM'] },
    ],
    emulators: [
      { name: 'FinalBurn Neo', need: 'required', where: 'RetroArch: system/fbneo/' },
      { name: 'MAME', need: 'required', where: 'roms/ (рядом с играми / next to games)' },
    ],
    links: [DOCS('fbneo', 'FinalBurn Neo')],
  },
  {
    id: 'neocd',
    name: 'Neo Geo CD',
    datSystem: 'SNK - NeoGeo CD',
    consoleKeys: ['neocd', 'neogeocd'],
    need: 'required',
    why: {
      ru: 'Ядро NeoCD требует два файла в подпапке neocd/: 000-lo.lo (или ng-lo.rom) и один из BIOS Neo Geo CD. Без них диски не загружаются.',
      en: 'The NeoCD core needs two files in the neocd/ subfolder: 000-lo.lo (or ng-lo.rom) and one Neo Geo CD BIOS. Discs will not load without them.',
      de: 'Der NeoCD-Core braucht zwei Dateien im Unterordner neocd/: 000-lo.lo (oder ng-lo.rom) und ein Neo-Geo-CD-BIOS. Ohne sie laden keine Discs.',
      es: 'El núcleo NeoCD necesita dos archivos en la subcarpeta neocd/: 000-lo.lo (o ng-lo.rom) y una BIOS de Neo Geo CD. Sin ellos los discos no cargan.',
      fr: 'Le cœur NeoCD demande deux fichiers dans le sous-dossier neocd/ : 000-lo.lo (ou ng-lo.rom) et un BIOS Neo Geo CD. Sans eux, les disques ne se chargent pas.',
      it: 'Il core NeoCD richiede due file nella sottocartella neocd/: 000-lo.lo (o ng-lo.rom) e un BIOS Neo Geo CD. Senza, i dischi non si caricano.',
      ja: 'NeoCDコアにはneocd/サブフォルダーに2つのファイルが必要です。000-lo.lo(またはng-lo.rom)とネオジオCDのBIOSの1つです。ないとディスクを読み込めません。',
      zh: 'NeoCD 核心需要在 neocd/ 子文件夹中放两个文件：000-lo.lo（或 ng-lo.rom）和一个 Neo Geo CD BIOS。缺少它们光盘无法加载。',
      sr: 'NeoCD jezgro traži dva fajla u podfolderu neocd/: 000-lo.lo (ili ng-lo.rom) i jedan Neo Geo CD BIOS. Bez njih se diskovi ne učitavaju.',
    },
    groups: [
      { level: 'required', mode: 'any', files: ['neocd/000-lo.lo', 'neocd/ng-lo.rom'] },
      {
        level: 'required',
        mode: 'any',
        files: ['neocd/neocd_z.rom', 'neocd/neocd_f.rom', 'neocd/neocd.bin', 'neocd/top-sp1.bin', 'neocd/front-sp1.bin', 'neocd/uni-bioscd.rom'],
        regions: ['CDZ', 'Front loader', 'Front loader', 'Top loader', 'Front loader', 'UniBIOS'],
      },
    ],
    emulators: [{ name: 'NeoCD (RetroArch)', need: 'required', where: 'RetroArch: system/neocd/' }],
    links: [DOCS('neocd', 'NeoCD')],
  },
  {
    id: 'gamecube',
    name: 'Nintendo GameCube',
    datSystem: 'Nintendo - GameCube',
    consoleKeys: ['gamecube'],
    need: 'optional',
    why: {
      ru: 'Dolphin запускает игры без BIOS (IPL). Настоящий IPL.bin нужен, чтобы видеть заставку GameCube, и для пары игр, которые берут системные шрифты.',
      en: 'Dolphin runs games without the BIOS (IPL). The real IPL.bin is only needed for the GameCube boot animation and a few games that use the system fonts.',
      de: 'Dolphin startet Spiele ohne BIOS (IPL). Das echte IPL.bin braucht man nur für die GameCube-Startanimation und wenige Spiele, die Systemschriften nutzen.',
      es: 'Dolphin ejecuta juegos sin BIOS (IPL). El IPL.bin real solo hace falta para la animación de arranque de GameCube y algunos juegos que usan las fuentes del sistema.',
      fr: 'Dolphin lance les jeux sans BIOS (IPL). Le vrai IPL.bin ne sert qu’à l’animation de démarrage GameCube et à quelques jeux qui utilisent les polices système.',
      it: 'Dolphin avvia i giochi senza BIOS (IPL). Il vero IPL.bin serve solo per l’animazione di avvio GameCube e pochi giochi che usano i font di sistema.',
      ja: 'DolphinはBIOS(IPL)なしでゲームを動かせます。本物のIPL.binはゲームキューブの起動アニメーションと、システムフォントを使う一部のゲームでのみ必要です。',
      zh: 'Dolphin 不需要 BIOS（IPL）就能运行游戏。真实的 IPL.bin 只用于 GameCube 开机动画，以及少数使用系统字体的游戏。',
      sr: 'Dolphin pokreće igre bez BIOS-a (IPL). Pravi IPL.bin treba samo za GameCube animaciju pri pokretanju i nekoliko igara koje koriste sistemske fontove.',
    },
    groups: [{ level: 'optional', mode: 'anyFromSystem', files: ['gc-ntsc-12.bin'] }],
    emulators: [
      { name: 'Dolphin', need: 'optional', where: 'User/GC/<USA|EUR|JAP>/IPL.bin' },
      { name: 'Dolphin (RetroArch)', need: 'optional', where: 'RetroArch: saves/dolphin-emu/User/GC/<USA|EUR|JAP>/IPL.bin' },
    ],
    links: [DOCS('dolphin', 'Dolphin')],
  },
  {
    id: 'ps3',
    name: 'Sony PlayStation 3',
    consoleKeys: ['ps3'],
    need: 'required',
    why: {
      ru: 'RPCS3 требует официальную прошивку PS3 (PS3UPDAT.PUP). Это единственный случай, когда файл законно скачивается с сайта Sony. Установка: File → Install Firmware. В папку bios её класть не нужно.',
      en: 'RPCS3 needs the official PS3 firmware (PS3UPDAT.PUP). This is the one case where the file is legally downloaded from Sony’s website. Install it via File → Install Firmware. It does not go into the bios folder.',
      de: 'RPCS3 braucht die offizielle PS3-Firmware (PS3UPDAT.PUP). Hier lädt man die Datei legal von Sonys Website. Installation: File → Install Firmware. In den bios-Ordner gehört sie nicht.',
      es: 'RPCS3 necesita el firmware oficial de PS3 (PS3UPDAT.PUP). Es el único caso en que el archivo se descarga legalmente de la web de Sony. Instálalo con File → Install Firmware. No va en la carpeta bios.',
      fr: 'RPCS3 a besoin du firmware officiel PS3 (PS3UPDAT.PUP). C’est le seul cas où le fichier se télécharge légalement sur le site de Sony. Installez-le via File → Install Firmware. Il ne va pas dans le dossier bios.',
      it: 'RPCS3 richiede il firmware ufficiale PS3 (PS3UPDAT.PUP). È l’unico caso in cui il file si scarica legalmente dal sito Sony. Installalo con File → Install Firmware. Non va nella cartella bios.',
      ja: 'RPCS3には公式のPS3システムソフトウェア(PS3UPDAT.PUP)が必要です。ソニーのサイトから合法的にダウンロードできる唯一のケースです。File → Install Firmwareでインストールします。biosフォルダーには入れません。',
      zh: 'RPCS3 需要官方 PS3 固件（PS3UPDAT.PUP）。这是唯一可以从索尼官网合法下载的情况。通过 File → Install Firmware 安装，不要放进 bios 文件夹。',
      sr: 'RPCS3 traži zvanični PS3 firmver (PS3UPDAT.PUP). Ovo je jedini slučaj kada se fajl legalno preuzima sa Sony sajta. Instalacija: File → Install Firmware. Ne ide u bios folder.',
    },
    groups: [],
    emulators: [{ name: 'RPCS3', need: 'required', where: 'File → Install Firmware' }],
    links: [
      { kind: 'official', label: 'PlayStation: PS3 system software', url: 'https://www.playstation.com/support/hardware/ps3/system-software/' },
      { kind: 'docs', label: 'RPCS3 Quickstart', url: 'https://rpcs3.net/quickstart' },
    ],
  },
  {
    id: '3do',
    name: '3DO Interactive Multiplayer',
    datSystem: '3DO Company, The - 3DO',
    consoleKeys: ['3do'],
    need: 'required',
    why: {
      ru: 'Ядро Opera не запускает игры 3DO без BIOS. Достаточно одного файла, чаще всего берут panafz10.bin.',
      en: 'The Opera core will not run 3DO games without a BIOS. One file is enough; panafz10.bin is the usual choice.',
      de: 'Der Opera-Core startet 3DO-Spiele nicht ohne BIOS. Eine Datei reicht, meist nimmt man panafz10.bin.',
      es: 'El núcleo Opera no ejecuta juegos de 3DO sin BIOS. Basta un archivo; lo habitual es panafz10.bin.',
      fr: 'Le cœur Opera ne lance pas les jeux 3DO sans BIOS. Un seul fichier suffit, en général panafz10.bin.',
      it: 'Il core Opera non avvia giochi 3DO senza BIOS. Basta un file; di solito si usa panafz10.bin.',
      ja: 'Operaコアは BIOSがないと3DOのゲームを動かせません。1つで十分で、普通はpanafz10.binを使います。',
      zh: '没有 BIOS，Opera 核心无法运行 3DO 游戏。一个文件就够，通常使用 panafz10.bin。',
      sr: 'Opera jezgro ne pokreće 3DO igre bez BIOS-a. Dovoljan je jedan fajl, obično panafz10.bin.',
    },
    groups: [
      {
        level: 'required',
        mode: 'any',
        files: ['panafz10.bin', 'panafz1.bin', 'panafz1j.bin', 'goldstar.bin', 'sanyotry.bin', 'panafz10-norsa.bin'],
        regions: ['FZ-10', 'FZ-1', 'FZ-1J', 'GoldStar', 'Sanyo', 'FZ-10 (RSA patch)'],
      },
    ],
    emulators: [{ name: 'Opera (RetroArch)', need: 'required', where: RA_SYSTEM }],
    links: [DOCS('opera', 'Opera')],
  },
  {
    id: 'pcfx',
    name: 'NEC PC-FX',
    datSystem: 'NEC - PC-FX',
    consoleKeys: ['pcfx'],
    need: 'required',
    why: {
      ru: 'Beetle PC-FX без BIOS не работает.',
      en: 'Beetle PC-FX does not work without a BIOS.',
      de: 'Beetle PC-FX funktioniert nicht ohne BIOS.',
      es: 'Beetle PC-FX no funciona sin BIOS.',
      fr: 'Beetle PC-FX ne fonctionne pas sans BIOS.',
      it: 'Beetle PC-FX non funziona senza BIOS.',
      ja: 'Beetle PC-FXはBIOSがないと動きません。',
      zh: '没有 BIOS，Beetle PC-FX 无法运行。',
      sr: 'Beetle PC-FX ne radi bez BIOS-a.',
    },
    groups: [{ level: 'required', mode: 'any', files: ['pcfx.rom'] }],
    emulators: [{ name: 'Beetle PC-FX', need: 'required', where: RA_SYSTEM }],
    links: [DOCS('beetle_pc_fx', 'Beetle PC-FX')],
  },
  {
    id: 'lynx',
    name: 'Atari Lynx',
    datSystem: 'Atari - Lynx',
    consoleKeys: ['lynx'],
    need: 'required',
    why: {
      ru: 'Ядро Handy требует загрузочный образ lynxboot.img, иначе игры не стартуют.',
      en: 'The Handy core needs the lynxboot.img boot image, otherwise games will not start.',
      de: 'Der Handy-Core braucht das Boot-Image lynxboot.img, sonst starten keine Spiele.',
      es: 'El núcleo Handy necesita la imagen de arranque lynxboot.img; sin ella los juegos no arrancan.',
      fr: 'Le cœur Handy a besoin de l’image de démarrage lynxboot.img, sinon les jeux ne démarrent pas.',
      it: 'Il core Handy richiede l’immagine di avvio lynxboot.img, altrimenti i giochi non partono.',
      ja: 'Handyコアには起動イメージlynxboot.imgが必要で、ないとゲームが起動しません。',
      zh: 'Handy 核心需要启动镜像 lynxboot.img，否则游戏无法启动。',
      sr: 'Handy jezgro traži lynxboot.img, inače se igre ne pokreću.',
    },
    groups: [{ level: 'required', mode: 'any', files: ['lynxboot.img'] }],
    emulators: [{ name: 'Handy', need: 'required', where: RA_SYSTEM }],
    links: [DOCS('handy', 'Handy')],
  },
  {
    id: 'colecovision',
    name: 'ColecoVision',
    datSystem: 'Coleco - ColecoVision',
    consoleKeys: ['colecovision', 'coleco'],
    need: 'required',
    why: {
      ru: 'Без системного BIOS ColecoVision (OS-7) игры не запускаются.',
      en: 'Games will not start without the ColecoVision system BIOS (OS-7).',
      de: 'Ohne das ColecoVision-System-BIOS (OS-7) starten keine Spiele.',
      es: 'Sin la BIOS del sistema ColecoVision (OS-7) los juegos no arrancan.',
      fr: 'Sans le BIOS système ColecoVision (OS-7), les jeux ne démarrent pas.',
      it: 'Senza il BIOS di sistema ColecoVision (OS-7) i giochi non partono.',
      ja: 'コレコビジョンのシステムBIOS(OS-7)がないとゲームは起動しません。',
      zh: '没有 ColecoVision 系统 BIOS（OS-7），游戏无法启动。',
      sr: 'Bez ColecoVision sistemskog BIOS-a (OS-7) igre se ne pokreću.',
    },
    groups: [{ level: 'required', mode: 'any', files: ['colecovision.rom', 'coleco.rom', 'BIOS.col'] }],
    emulators: [
      { name: 'Gearcoleco', need: 'required', where: RA_SYSTEM },
      { name: 'blueMSX', need: 'required', where: RA_SYSTEM },
    ],
    links: [DOCS('gearcoleco', 'Gearcoleco'), DOCS('bluemsx', 'blueMSX')],
  },
  {
    id: 'intellivision',
    name: 'Mattel Intellivision',
    datSystem: 'Mattel - Intellivision',
    consoleKeys: ['intellivision', 'intv'],
    need: 'required',
    why: {
      ru: 'FreeIntv нужны оба файла: exec.bin (системная программа) и grom.bin (графика).',
      en: 'FreeIntv needs both files: exec.bin (system program) and grom.bin (graphics).',
      de: 'FreeIntv braucht beide Dateien: exec.bin (Systemprogramm) und grom.bin (Grafik).',
      es: 'FreeIntv necesita los dos archivos: exec.bin (programa del sistema) y grom.bin (gráficos).',
      fr: 'FreeIntv a besoin des deux fichiers : exec.bin (programme système) et grom.bin (graphismes).',
      it: 'FreeIntv richiede entrambi i file: exec.bin (programma di sistema) e grom.bin (grafica).',
      ja: 'FreeIntvにはexec.bin(システムプログラム)とgrom.bin(グラフィック)の両方が必要です。',
      zh: 'FreeIntv 需要两个文件：exec.bin（系统程序）和 grom.bin（图形）。',
      sr: 'FreeIntv traži oba fajla: exec.bin (sistemski program) i grom.bin (grafika).',
    },
    groups: [{ level: 'required', mode: 'all', files: ['exec.bin', 'grom.bin'] }],
    emulators: [{ name: 'FreeIntv', need: 'required', where: RA_SYSTEM }],
    links: [DOCS('freeintv', 'FreeIntv')],
  },
  {
    id: 'atari7800',
    name: 'Atari 7800',
    datSystem: 'Atari - 7800',
    consoleKeys: ['atari7800'],
    need: 'optional',
    why: {
      ru: 'ProSystem запускает игры без BIOS. С ним появляется оригинальная заставка и исправляется пара редких игр.',
      en: 'ProSystem runs games without a BIOS. With it you get the original boot screen and a couple of rare games are fixed.',
      de: 'ProSystem startet Spiele ohne BIOS. Mit BIOS gibt es den Original-Startbildschirm und ein paar seltene Spiele laufen korrekt.',
      es: 'ProSystem ejecuta juegos sin BIOS. Con ella aparece la pantalla de arranque original y se corrigen un par de juegos raros.',
      fr: 'ProSystem lance les jeux sans BIOS. Avec lui, on obtient l’écran de démarrage d’origine et quelques jeux rares fonctionnent.',
      it: 'ProSystem avvia i giochi senza BIOS. Con il BIOS compare la schermata originale e si correggono un paio di giochi rari.',
      ja: 'ProSystemはBIOSなしで動きます。BIOSを入れると本来の起動画面が出て、まれな一部のゲームも正しく動きます。',
      zh: 'ProSystem 不需要 BIOS 就能运行。加上 BIOS 可显示原始开机画面，并修复少数游戏。',
      sr: 'ProSystem pokreće igre bez BIOS-a. Sa njim dobijate originalni početni ekran i ispravku par retkih igara.',
    },
    groups: [{ level: 'optional', mode: 'any', files: ['7800 BIOS (U).rom', '7800 BIOS (E).rom'], regions: ['USA', 'Europe'] }],
    emulators: [{ name: 'ProSystem', need: 'optional', where: RA_SYSTEM }],
    links: [DOCS('prosystem', 'ProSystem')],
  },
  {
    id: 'atari5200',
    name: 'Atari 5200',
    datSystem: 'Atari - 5200',
    consoleKeys: ['atari5200'],
    need: 'optional',
    why: {
      ru: 'Ядро Atari800 содержит свободную замену AltirraOS и работает без BIOS. Оригинальный 5200.rom лучше совместим с отдельными играми.',
      en: 'The Atari800 core ships the free AltirraOS replacement and runs without a BIOS. The original 5200.rom is more compatible with some games.',
      de: 'Der Atari800-Core enthält den freien Ersatz AltirraOS und läuft ohne BIOS. Das originale 5200.rom ist mit manchen Spielen kompatibler.',
      es: 'El núcleo Atari800 incluye el sustituto libre AltirraOS y funciona sin BIOS. El 5200.rom original es más compatible con algunos juegos.',
      fr: 'Le cœur Atari800 intègre le remplaçant libre AltirraOS et fonctionne sans BIOS. Le 5200.rom d’origine est plus compatible avec certains jeux.',
      it: 'Il core Atari800 include il sostituto libero AltirraOS e funziona senza BIOS. Il 5200.rom originale è più compatibile con alcuni giochi.',
      ja: 'Atari800コアにはフリーな代替のAltirraOSが入っており、BIOSなしで動きます。オリジナルの5200.romは一部のゲームで互換性が高くなります。',
      zh: 'Atari800 核心内置免费替代品 AltirraOS，无需 BIOS 即可运行。原版 5200.rom 对部分游戏兼容性更好。',
      sr: 'Atari800 jezgro sadrži slobodnu zamenu AltirraOS i radi bez BIOS-a. Originalni 5200.rom je kompatibilniji sa nekim igrama.',
    },
    groups: [{ level: 'optional', mode: 'any', files: ['5200.rom'] }],
    emulators: [{ name: 'Atari800', need: 'optional', where: RA_SYSTEM }],
    links: [DOCS('atari800', 'Atari800')],
  },
  {
    id: 'mastersystem',
    name: 'Sega Master System',
    datSystem: 'Sega - Master System - Mark III',
    consoleKeys: ['mastersystem'],
    need: 'optional',
    why: {
      ru: 'Не нужен для игр. Даёт только оригинальную заставку при включении (опция «System bootrom» в Genesis Plus GX).',
      en: 'Not needed for games. It only adds the original boot screen (the “System bootrom” option in Genesis Plus GX).',
      de: 'Für Spiele nicht nötig. Zeigt nur den Original-Startbildschirm (Option „System bootrom“ in Genesis Plus GX).',
      es: 'No hace falta para jugar. Solo añade la pantalla de arranque original (opción «System bootrom» en Genesis Plus GX).',
      fr: 'Inutile pour jouer. Il ajoute seulement l’écran de démarrage d’origine (option « System bootrom » dans Genesis Plus GX).',
      it: 'Non serve per giocare. Aggiunge solo la schermata di avvio originale (opzione «System bootrom» in Genesis Plus GX).',
      ja: 'ゲームには不要です。本来の起動画面が出るだけです(Genesis Plus GXの「System bootrom」オプション)。',
      zh: '玩游戏不需要。只会显示原始开机画面（Genesis Plus GX 的“System bootrom”选项）。',
      sr: 'Nije potreban za igre. Dodaje samo originalni početni ekran (opcija „System bootrom“ u Genesis Plus GX).',
    },
    groups: [{ level: 'optional', mode: 'any', files: ['bios_E.sms', 'bios_U.sms', 'bios_J.sms'], regions: ['Europe', 'USA', 'Japan'] }],
    emulators: [{ name: 'Genesis Plus GX', need: 'optional', where: RA_SYSTEM }],
    links: [DOCS('genesis_plus_gx', 'Genesis Plus GX')],
  },
  {
    id: 'gamegear',
    name: 'Sega Game Gear',
    datSystem: 'Sega - Game Gear',
    consoleKeys: ['gamegear'],
    need: 'optional',
    why: {
      ru: 'Не нужен для игр. Даёт только оригинальную заставку при включении.',
      en: 'Not needed for games. It only adds the original boot screen.',
      de: 'Für Spiele nicht nötig. Zeigt nur den Original-Startbildschirm.',
      es: 'No hace falta para jugar. Solo añade la pantalla de arranque original.',
      fr: 'Inutile pour jouer. Il ajoute seulement l’écran de démarrage d’origine.',
      it: 'Non serve per giocare. Aggiunge solo la schermata di avvio originale.',
      ja: 'ゲームには不要です。本来の起動画面が出るだけです。',
      zh: '玩游戏不需要，只会显示原始开机画面。',
      sr: 'Nije potreban za igre. Dodaje samo originalni početni ekran.',
    },
    groups: [{ level: 'optional', mode: 'any', files: ['bios.gg'] }],
    emulators: [{ name: 'Genesis Plus GX', need: 'optional', where: RA_SYSTEM }],
    links: [DOCS('genesis_plus_gx', 'Genesis Plus GX')],
  },
  {
    id: 'gb',
    name: 'Nintendo Game Boy',
    datSystem: 'Nintendo - Gameboy',
    consoleKeys: ['gb'],
    need: 'optional',
    why: {
      ru: 'Не нужен для игр. Загрузочный ROM показывает логотип Nintendo при запуске, как на настоящей консоли.',
      en: 'Not needed for games. The boot ROM shows the Nintendo logo at start-up, like the real console.',
      de: 'Für Spiele nicht nötig. Das Boot-ROM zeigt beim Start das Nintendo-Logo wie auf der echten Konsole.',
      es: 'No hace falta para jugar. La boot ROM muestra el logo de Nintendo al arrancar, como en la consola real.',
      fr: 'Inutile pour jouer. La boot ROM affiche le logo Nintendo au démarrage, comme sur la vraie console.',
      it: 'Non serve per giocare. La boot ROM mostra il logo Nintendo all’avvio, come sulla console reale.',
      ja: 'ゲームには不要です。ブートROMを入れると実機のように起動時にNintendoロゴが出ます。',
      zh: '玩游戏不需要。启动 ROM 会像真机一样在开机时显示 Nintendo 标志。',
      sr: 'Nije potreban za igre. Boot ROM pri pokretanju prikazuje Nintendo logo, kao na pravoj konzoli.',
    },
    groups: [
      { level: 'optional', mode: 'any', files: ['gb_bios.bin', 'dmg_boot.bin'], regions: ['Game Boy', 'Game Boy'] },
    ],
    emulators: [
      { name: 'Gambatte', need: 'optional', where: RA_SYSTEM },
      { name: 'mGBA', need: 'optional', where: RA_SYSTEM },
    ],
    links: [DOCS('mgba', 'mGBA')],
  },
  {
    id: 'gbc',
    name: 'Nintendo Game Boy Color (boot ROM)',
    datSystem: 'Nintendo - Gameboy Color',
    consoleKeys: ['gbc'],
    need: 'optional',
    why: {
      ru: 'Не нужен для игр. Загрузочный ROM Game Boy Color даёт заставку и оригинальные палитры для старых чёрно-белых игр.',
      en: 'Not needed for games. The Game Boy Color boot ROM adds the start-up screen and the original colour palettes for old monochrome games.',
      de: 'Für Spiele nicht nötig. Das GBC-Boot-ROM bringt den Startbildschirm und die Original-Farbpaletten für alte Schwarz-Weiß-Spiele.',
      es: 'No hace falta para jugar. La boot ROM de Game Boy Color añade la pantalla de inicio y las paletas originales para los juegos monocromo.',
      fr: 'Inutile pour jouer. La boot ROM Game Boy Color ajoute l’écran de démarrage et les palettes d’origine pour les vieux jeux monochromes.',
      it: 'Non serve per giocare. La boot ROM Game Boy Color aggiunge la schermata iniziale e le palette originali per i vecchi giochi monocromatici.',
      ja: 'ゲームには不要です。ゲームボーイカラーのブートROMで起動画面と、白黒ゲーム用の本来のカラーパレットが使えます。',
      zh: '玩游戏不需要。Game Boy Color 启动 ROM 提供开机画面，并为黑白老游戏提供原始配色。',
      sr: 'Nije potreban za igre. GBC boot ROM dodaje početni ekran i originalne palete boja za stare crno-bele igre.',
    },
    groups: [{ level: 'optional', mode: 'any', files: ['gbc_bios.bin', 'cgb_boot.bin'] }],
    emulators: [
      { name: 'Gambatte', need: 'optional', where: RA_SYSTEM },
      { name: 'mGBA', need: 'optional', where: RA_SYSTEM },
    ],
    links: [DOCS('mgba', 'mGBA')],
  },
  {
    id: 'nobios',
    name: 'NES, SNES, Mega Drive / Genesis, N64, PSP, 32X',
    consoleKeys: ['nes', 'famicom', 'snes', 'genesis', 'n64', 'psp', 'sega32x', 'atari2600'],
    need: 'none',
    why: {
      ru: 'Для этих консолей BIOS не нужен: эмуляторы запускают игры сразу. Если где-то пишут обратное, это не так.',
      en: 'These consoles need no BIOS: emulators start games right away. If a guide says otherwise, it is wrong.',
      de: 'Diese Konsolen brauchen kein BIOS: Emulatoren starten die Spiele sofort. Steht es anderswo anders, stimmt es nicht.',
      es: 'Estas consolas no necesitan BIOS: los emuladores inician los juegos directamente. Si alguna guía dice lo contrario, se equivoca.',
      fr: 'Ces consoles n’ont pas besoin de BIOS : les émulateurs lancent les jeux directement. Si un guide affirme le contraire, il se trompe.',
      it: 'Queste console non richiedono BIOS: gli emulatori avviano subito i giochi. Se una guida dice il contrario, sbaglia.',
      ja: 'これらの機種にBIOSは不要で、エミュレーターはすぐにゲームを起動します。必要だと書かれていても誤りです。',
      zh: '这些主机不需要 BIOS：模拟器可以直接运行游戏。如果有教程说需要，那是错的。',
      sr: 'Za ove konzole BIOS nije potreban: emulatori odmah pokreću igre. Ako negde piše drugačije, to nije tačno.',
    },
    groups: [],
    emulators: [],
    links: [],
  },
];

/** Нормализует код консоли из библиотеки к ключам справочника BIOS. */
export function normalizeBiosConsoleKey(consoleShort: string): string {
  const low = (consoleShort || '').toLowerCase().replace(/[\s_-]+/g, '').trim();
  const alias: Record<string, string> = {
    ps1: 'psx',
    psx: 'psx',
    playstation: 'psx',
    ps2: 'ps2',
    ps3: 'ps3',
    md: 'genesis',
    megadrive: 'genesis',
    genesis: 'genesis',
    scd: 'segacd',
    segacd: 'segacd',
    megacd: 'segacd',
    mcd: 'segacd',
    sat: 'saturn',
    saturn: 'saturn',
    dc: 'dreamcast',
    dreamcast: 'dreamcast',
    gc: 'gamecube',
    ngc: 'gamecube',
    gamecube: 'gamecube',
    fds: 'fds',
    famicomdisk: 'fds',
    pce: 'pcengine',
    pcengine: 'pcengine',
    tg16: 'pcengine',
    pcecd: 'pcecd',
    pcenginecd: 'pcecd',
    tgcd: 'pcecd',
    fbneo: 'arcade',
    mame: 'arcade',
    arcade: 'arcade',
    neogeo: 'neogeo',
    neocd: 'neocd',
    neogeocd: 'neocd',
    sms: 'mastersystem',
    mastersystem: 'mastersystem',
    gg: 'gamegear',
    gamegear: 'gamegear',
    '3do': '3do',
    pcfx: 'pcfx',
    lynx: 'lynx',
    coleco: 'colecovision',
    colecovision: 'colecovision',
    intv: 'intellivision',
    intellivision: 'intellivision',
    a7800: 'atari7800',
    atari7800: 'atari7800',
    a5200: 'atari5200',
    atari5200: 'atari5200',
    sfc: 'snes',
    fc: 'nes',
    famicom: 'nes',
  };
  return alias[low] || low;
}

export function guideSystemsForConsole(consoleShort: string): BiosGuideSystem[] {
  const key = normalizeBiosConsoleKey(consoleShort);
  return BIOS_GUIDE.filter((s) => s.consoleKeys.includes(key));
}

export function localizedBiosText(text: LocalizedText, lang: string): string {
  return (text as Record<string, string>)[lang] || text.en;
}
