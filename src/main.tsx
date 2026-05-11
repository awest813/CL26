import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import App from './App.tsx';
import BootstrapSplash from './components/BootstrapSplash.tsx';
import { store } from './store/store.ts';
import { persistor } from './store/persistor.ts';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate persistor={persistor} loading={<BootstrapSplash />}>
        <App />
      </PersistGate>
    </Provider>
  </React.StrictMode>,
);
