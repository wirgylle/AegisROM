import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {I18nProvider} from './i18n/translations';
import {hydrateFromNativeStorage} from './utils/nativeStorage';
import {loadMultiDbsFromIndexedDB, saveMultiDbsToIndexedDB} from './utils/persistentHandles';
import './index.css';

// Сначала восстанавливаем настройки с диска (нужно при смене окна), потом рисуем UI.
// Restore settings from disk first (needed when the window changes), then render.
void hydrateFromNativeStorage({
  load: loadMultiDbsFromIndexedDB,
  save: saveMultiDbsToIndexedDB,
}).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <I18nProvider>
      <App />
    </I18nProvider>
  );
});
