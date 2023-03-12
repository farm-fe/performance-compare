import React from "react";


let EFFECT_PROPS = {};

/* @turbopack-bench:eval-start */
/* @turbopack-bench:eval-end */


function Triangle({ style }) {
    React.useEffect(() => {
    if (EFFECT_PROPS.hydration) {
        globalThis.__turbopackBenchBinding && globalThis.__turbopackBenchBinding("Hydration done");
    }
    if (EFFECT_PROPS.message) {
        globalThis.__turbopackBenchBinding && globalThis.__turbopackBenchBinding(EFFECT_PROPS.message);
    }
}, [EFFECT_PROPS]);

    return <>
        <polygon points="-5,4.33 0,-4.33 5,4.33" style={style} />
        
    </>;
}

export default React.memo(Triangle);
