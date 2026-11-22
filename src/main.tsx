import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import App from './App.tsx';
import BootstrapSplash from './components/BootstrapSplash.tsx';
import { store } from './store/store.ts';
import { persistor } from './store/persistor.ts';
import './index.css';

// index.html has already told a browser that is too old for the game; leave that notice up.
if (!(window as Window & { __cl26Unsupported?: boolean }).__cl26Unsupported) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <Provider store={store}>
        <PersistGate persistor={persistor} loading={<BootstrapSplash />}>
          <App />
        </PersistGate>
      </Provider>
    </React.StrictMode>,
  );
}
