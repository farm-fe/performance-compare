import React from "react";
import Triangle from "../triangle.jsx";

export default function Page() {
    return <svg height="100%" viewBox="-5 -4.33 10 8.66" style={{ backgroundColor: "black" }}>
        <Triangle style={{ fill: "white" }}/>
    </svg>
}

export function getStaticProps() {
    return {
        props: {}
    };
}
