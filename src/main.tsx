import React, { Suspense } from 'react';
import { CounterButton } from './comps/counter-button';
import { Description } from './comps/description';
import './main.css';

const DynamicClock = React.lazy(() => import('./comps/dynamic-clock/index'));

export function Main() {
  return (
    <Suspense fallback={'loading'}>
      <div className='button-wrapper'>
        <CounterButton />
      </div>
      <div>
        <Description />
      </div>
      <DynamicClock />
    </Suspense>
  );
}
