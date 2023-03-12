import React from 'react';
import { createRoot } from 'react-dom/client';

import { Main } from './main';
const container = document.querySelector('#root')!;

if (!container) {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  createRoot(root).render(<Main />);
} else {
  createRoot(container).render(<Main />);
}