import React from "react";

import A from "./triangle_1";
import B from "./triangle_2";
import C from "./triangle_3";

let EFFECT_PROPS = {};

EFFECT_PROPS.hydration = true;
/* @turbopack-bench:eval-start */
/* @turbopack-bench:eval-end */

function Container({ style }) {
  React.useEffect(() => {
    if (EFFECT_PROPS.hydration) {
      globalThis.__turbopackBenchBinding &&
        globalThis.__turbopackBenchBinding("Hydration done");
    }
    if (EFFECT_PROPS.message) {
      globalThis.__turbopackBenchBinding &&
        globalThis.__turbopackBenchBinding(EFFECT_PROPS.message);
    }
  }, [EFFECT_PROPS]);

  return (
    <>
      <g transform="translate(0 -2.16)   scale(0.5 0.5)">
        <A style={style} />
      </g>
      <g transform="translate(-2.5 2.16) scale(0.5 0.5)">
        <B style={style} />
      </g>
      <g transform="translate(2.5 2.16)  scale(0.5 0.5)">
        <C style={style} />
      </g>
    </>
  );
}

export default React.memo(Container);

    console.log('root hmr', Date.now());
    
    console.log('root hmr', Date.now());
    
    console.log('root hmr', Date.now());
    
    console.log('root hmr', Date.now());
    
    console.log('root hmr', Date.now());
    
    console.log('root hmr', Date.now());
    
    console.log('root hmr', Date.now());
    
    console.log('root hmr', Date.now());
    
    console.log('root hmr', Date.now());
    
    console.log('root hmr', Date.now());
    
    console.log('root hmr', Date.now());
    
    console.log('root hmr', Date.now());
    