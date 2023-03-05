import React from 'react';

export default function DynamicClock() {
    const [time, setTime] = React.useState(new Date().toLocaleTimeString());

    React.useEffect(() => {
        const timer = setInterval(() => {
        setTime(new Date().toLocaleTimeString());
        }, 1000);

        return () => {
        clearInterval(timer);
        };
    }, []);

    return <div>{time}</div>;
}