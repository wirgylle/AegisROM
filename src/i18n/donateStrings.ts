// Тексты кнопки «кофе» и окна доната в USDT на всех языках интерфейса. Подмешиваются в translations.tsx.
// "Coffee" button and USDT donate window strings in every UI language. Merged in translations.tsx.

type Dict = Record<string, string>;

const EN: Dict = {
  'coffee.button': 'Buy the developer a coffee',
  'coffee.hint': 'AegisROM is free. If it saves you time, you can thank the developer with a coffee.',
  'donate.title': 'Buy the developer a coffee',
  'donate.intro': 'AegisROM is free. If it saves you time, you can send a USDT tip. Thank you!',
  'donate.amount': 'Amount',
  'donate.custom': 'Other',
  'donate.customPlaceholder': 'Your amount',
  'donate.customInvalid': 'Enter a number above zero, for example 3 or 7.5.',
  'donate.network': 'Network',
  'donate.send': 'Send {amount} USDT on {network}',
  'donate.address': 'USDT address on {network}',
  'donate.copy': 'Copy',
  'donate.copied': 'Copied',
  'donate.copyAmount': 'Copy amount',
  'donate.copyFailed': 'Could not copy. Select the address and copy it by hand.',
  'donate.warn':
    'Send only USDT and only on {network} ({standard}). In your wallet or exchange pick exactly this network. Coins sent on another network or another token will be lost.',
  'donate.evmShared': 'This address is the same on Arbitrum One, Avalanche C-Chain and Ethereum. The network in your wallet must still be {network}.',
  'donate.qrHint': 'Scan with a wallet app. The QR code holds only the address, so enter the amount yourself.',
  'donate.close': 'Close',
};

const RU: Dict = {
  'coffee.button': 'Угостить разработчика кофе',
  'coffee.hint': 'AegisROM бесплатный. Если он экономит вам время, можно поблагодарить разработчика чашкой кофе.',
  'donate.title': 'Угостить разработчика кофе',
  'donate.intro': 'AegisROM бесплатный. Если он экономит вам время, можно отправить чаевые в USDT. Спасибо!',
  'donate.amount': 'Сумма',
  'donate.custom': 'Своя',
  'donate.customPlaceholder': 'Ваша сумма',
  'donate.customInvalid': 'Введите число больше нуля, например 3 или 7,5.',
  'donate.network': 'Сеть',
  'donate.send': 'Отправьте {amount} USDT в сети {network}',
  'donate.address': 'Адрес USDT в сети {network}',
  'donate.copy': 'Скопировать',
  'donate.copied': 'Скопировано',
  'donate.copyAmount': 'Скопировать сумму',
  'donate.copyFailed': 'Не удалось скопировать. Выделите адрес и скопируйте вручную.',
  'donate.warn':
    'Отправляйте только USDT и только в сети {network} ({standard}). В кошельке или на бирже выберите именно эту сеть. Монеты, отправленные в другой сети или другим токеном, пропадут.',
  'donate.evmShared': 'Этот адрес одинаковый для Arbitrum One, Avalanche C-Chain и Ethereum. Сеть в кошельке всё равно должна быть {network}.',
  'donate.qrHint': 'Отсканируйте приложением кошелька. В QR-коде только адрес, сумму введите сами.',
  'donate.close': 'Закрыть',
};

const DE: Dict = {
  'coffee.button': 'Dem Entwickler einen Kaffee spendieren',
  'coffee.hint': 'AegisROM ist kostenlos. Wenn es dir Zeit spart, kannst du dem Entwickler mit einem Kaffee danken.',
  'donate.title': 'Dem Entwickler einen Kaffee spendieren',
  'donate.intro': 'AegisROM ist kostenlos. Wenn es dir Zeit spart, kannst du ein Trinkgeld in USDT senden. Danke!',
  'donate.amount': 'Betrag',
  'donate.custom': 'Anderer',
  'donate.customPlaceholder': 'Dein Betrag',
  'donate.customInvalid': 'Gib eine Zahl über null ein, zum Beispiel 3 oder 7,5.',
  'donate.network': 'Netzwerk',
  'donate.send': 'Sende {amount} USDT im Netzwerk {network}',
  'donate.address': 'USDT-Adresse im Netzwerk {network}',
  'donate.copy': 'Kopieren',
  'donate.copied': 'Kopiert',
  'donate.copyAmount': 'Betrag kopieren',
  'donate.copyFailed': 'Kopieren fehlgeschlagen. Markiere die Adresse und kopiere sie von Hand.',
  'donate.warn':
    'Sende nur USDT und nur im Netzwerk {network} ({standard}). Wähle in deiner Wallet oder Börse genau dieses Netzwerk. Coins in einem anderen Netzwerk oder als anderer Token gehen verloren.',
  'donate.evmShared': 'Diese Adresse ist für Arbitrum One, Avalanche C-Chain und Ethereum gleich. Das Netzwerk in der Wallet muss trotzdem {network} sein.',
  'donate.qrHint': 'Mit einer Wallet-App scannen. Der QR-Code enthält nur die Adresse, den Betrag gibst du selbst ein.',
  'donate.close': 'Schließen',
};

const ES: Dict = {
  'coffee.button': 'Invitar un café al desarrollador',
  'coffee.hint': 'AegisROM es gratis. Si te ahorra tiempo, puedes agradecer al desarrollador con un café.',
  'donate.title': 'Invitar un café al desarrollador',
  'donate.intro': 'AegisROM es gratis. Si te ahorra tiempo, puedes enviar una propina en USDT. ¡Gracias!',
  'donate.amount': 'Importe',
  'donate.custom': 'Otro',
  'donate.customPlaceholder': 'Tu importe',
  'donate.customInvalid': 'Introduce un número mayor que cero, por ejemplo 3 o 7,5.',
  'donate.network': 'Red',
  'donate.send': 'Envía {amount} USDT en la red {network}',
  'donate.address': 'Dirección USDT en la red {network}',
  'donate.copy': 'Copiar',
  'donate.copied': 'Copiado',
  'donate.copyAmount': 'Copiar importe',
  'donate.copyFailed': 'No se pudo copiar. Selecciona la dirección y cópiala a mano.',
  'donate.warn':
    'Envía solo USDT y solo en la red {network} ({standard}). En tu billetera o exchange elige exactamente esta red. Las monedas enviadas por otra red o como otro token se perderán.',
  'donate.evmShared': 'Esta dirección es la misma en Arbitrum One, Avalanche C-Chain y Ethereum. Aun así, la red en tu billetera debe ser {network}.',
  'donate.qrHint': 'Escanea con una app de billetera. El código QR solo contiene la dirección; el importe lo introduces tú.',
  'donate.close': 'Cerrar',
};

const FR: Dict = {
  'coffee.button': 'Offrir un café au développeur',
  'coffee.hint': 'AegisROM est gratuit. S’il vous fait gagner du temps, vous pouvez remercier le développeur avec un café.',
  'donate.title': 'Offrir un café au développeur',
  'donate.intro': 'AegisROM est gratuit. S’il vous fait gagner du temps, vous pouvez envoyer un pourboire en USDT. Merci !',
  'donate.amount': 'Montant',
  'donate.custom': 'Autre',
  'donate.customPlaceholder': 'Votre montant',
  'donate.customInvalid': 'Saisissez un nombre supérieur à zéro, par exemple 3 ou 7,5.',
  'donate.network': 'Réseau',
  'donate.send': 'Envoyez {amount} USDT sur le réseau {network}',
  'donate.address': 'Adresse USDT sur le réseau {network}',
  'donate.copy': 'Copier',
  'donate.copied': 'Copié',
  'donate.copyAmount': 'Copier le montant',
  'donate.copyFailed': 'Copie impossible. Sélectionnez l’adresse et copiez-la à la main.',
  'donate.warn':
    'Envoyez uniquement des USDT et uniquement sur le réseau {network} ({standard}). Dans votre portefeuille ou sur la plateforme, choisissez exactement ce réseau. Les fonds envoyés sur un autre réseau ou en autre jeton seront perdus.',
  'donate.evmShared': 'Cette adresse est la même sur Arbitrum One, Avalanche C-Chain et Ethereum. Le réseau dans votre portefeuille doit quand même être {network}.',
  'donate.qrHint': 'Scannez avec une application de portefeuille. Le QR code contient seulement l’adresse ; saisissez le montant vous-même.',
  'donate.close': 'Fermer',
};

const IT: Dict = {
  'coffee.button': 'Offri un caffè allo sviluppatore',
  'coffee.hint': 'AegisROM è gratuito. Se ti fa risparmiare tempo, puoi ringraziare lo sviluppatore con un caffè.',
  'donate.title': 'Offri un caffè allo sviluppatore',
  'donate.intro': 'AegisROM è gratuito. Se ti fa risparmiare tempo, puoi inviare una mancia in USDT. Grazie!',
  'donate.amount': 'Importo',
  'donate.custom': 'Altro',
  'donate.customPlaceholder': 'Il tuo importo',
  'donate.customInvalid': 'Inserisci un numero maggiore di zero, per esempio 3 o 7,5.',
  'donate.network': 'Rete',
  'donate.send': 'Invia {amount} USDT sulla rete {network}',
  'donate.address': 'Indirizzo USDT sulla rete {network}',
  'donate.copy': 'Copia',
  'donate.copied': 'Copiato',
  'donate.copyAmount': 'Copia importo',
  'donate.copyFailed': 'Impossibile copiare. Seleziona l’indirizzo e copialo a mano.',
  'donate.warn':
    'Invia solo USDT e solo sulla rete {network} ({standard}). Nel wallet o sull’exchange scegli esattamente questa rete. I fondi inviati su un’altra rete o come altro token andranno persi.',
  'donate.evmShared': 'Questo indirizzo è lo stesso su Arbitrum One, Avalanche C-Chain ed Ethereum. La rete nel wallet deve comunque essere {network}.',
  'donate.qrHint': 'Scansiona con un’app wallet. Il QR contiene solo l’indirizzo: l’importo lo inserisci tu.',
  'donate.close': 'Chiudi',
};

const JA: Dict = {
  'coffee.button': '開発者にコーヒーをおごる',
  'coffee.hint': 'AegisROMは無料です。役に立ったら、コーヒー1杯で開発者を応援できます。',
  'donate.title': '開発者にコーヒーをおごる',
  'donate.intro': 'AegisROMは無料です。役に立ったら、USDTでチップを送れます。ありがとうございます！',
  'donate.amount': '金額',
  'donate.custom': 'その他',
  'donate.customPlaceholder': '金額を入力',
  'donate.customInvalid': '0より大きい数を入力してください（例：3、7.5）。',
  'donate.network': 'ネットワーク',
  'donate.send': '{network}で{amount} USDTを送金',
  'donate.address': '{network}のUSDTアドレス',
  'donate.copy': 'コピー',
  'donate.copied': 'コピーしました',
  'donate.copyAmount': '金額をコピー',
  'donate.copyFailed': 'コピーできませんでした。アドレスを選択して手動でコピーしてください。',
  'donate.warn':
    'USDTのみを、{network}（{standard}）でのみ送ってください。ウォレットや取引所では必ずこのネットワークを選んでください。別のネットワークや別のトークンで送った資金は失われます。',
  'donate.evmShared': 'このアドレスはArbitrum One、Avalanche C-Chain、Ethereumで共通です。ただしウォレットのネットワークは{network}にしてください。',
  'donate.qrHint': 'ウォレットアプリで読み取ってください。QRコードにはアドレスのみが入っているため、金額はご自身で入力してください。',
  'donate.close': '閉じる',
};

const ZH: Dict = {
  'coffee.button': '请开发者喝杯咖啡',
  'coffee.hint': 'AegisROM 免费。如果它为你节省了时间，可以请开发者喝杯咖啡表示感谢。',
  'donate.title': '请开发者喝杯咖啡',
  'donate.intro': 'AegisROM 免费。如果它为你节省了时间，可以用 USDT 打赏。谢谢！',
  'donate.amount': '金额',
  'donate.custom': '其他',
  'donate.customPlaceholder': '自定义金额',
  'donate.customInvalid': '请输入大于零的数字，例如 3 或 7.5。',
  'donate.network': '网络',
  'donate.send': '通过 {network} 发送 {amount} USDT',
  'donate.address': '{network} 上的 USDT 地址',
  'donate.copy': '复制',
  'donate.copied': '已复制',
  'donate.copyAmount': '复制金额',
  'donate.copyFailed': '无法复制。请选中地址后手动复制。',
  'donate.warn':
    '只发送 USDT，并且只通过 {network}（{standard}）发送。在钱包或交易所中请选择完全相同的网络。通过其他网络或以其他代币发送的资金将会丢失。',
  'donate.evmShared': '该地址在 Arbitrum One、Avalanche C-Chain 和 Ethereum 上相同，但钱包中的网络仍必须是 {network}。',
  'donate.qrHint': '请用钱包应用扫描。二维码只包含地址，金额需自行输入。',
  'donate.close': '关闭',
};

const SR: Dict = {
  'coffee.button': 'Častite programera kafom',
  'coffee.hint': 'AegisROM je besplatan. Ako vam štedi vreme, možete se zahvaliti programeru kafom.',
  'donate.title': 'Častite programera kafom',
  'donate.intro': 'AegisROM je besplatan. Ako vam štedi vreme, možete poslati napojnicu u USDT. Hvala!',
  'donate.amount': 'Iznos',
  'donate.custom': 'Drugi',
  'donate.customPlaceholder': 'Vaš iznos',
  'donate.customInvalid': 'Unesite broj veći od nule, na primer 3 ili 7,5.',
  'donate.network': 'Mreža',
  'donate.send': 'Pošaljite {amount} USDT na mreži {network}',
  'donate.address': 'USDT adresa na mreži {network}',
  'donate.copy': 'Kopiraj',
  'donate.copied': 'Kopirano',
  'donate.copyAmount': 'Kopiraj iznos',
  'donate.copyFailed': 'Kopiranje nije uspelo. Označite adresu i kopirajte je ručno.',
  'donate.warn':
    'Šaljite samo USDT i samo na mreži {network} ({standard}). U novčaniku ili na menjačnici izaberite baš ovu mrežu. Sredstva poslata drugom mrežom ili kao drugi token biće izgubljena.',
  'donate.evmShared': 'Ova adresa je ista za Arbitrum One, Avalanche C-Chain i Ethereum. Mreža u novčaniku i dalje mora biti {network}.',
  'donate.qrHint': 'Skenirajte aplikacijom novčanika. QR kod sadrži samo adresu, iznos unesite sami.',
  'donate.close': 'Zatvori',
};

export const DONATE_STRINGS: Record<string, Dict> = { en: EN, ru: RU, de: DE, es: ES, fr: FR, it: IT, ja: JA, zh: ZH, sr: SR };
