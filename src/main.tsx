import React from 'react';
import './main.css';

import Triangle from './comps/triangle';

export function Main() {
  return (
    <svg height="100%" viewBox="-5 -4.33 10 8.66" style={{ backgroundColor: "black" }}>
        <Triangle style={{ fill: "white" }}/>
    </svg>
  );
}
