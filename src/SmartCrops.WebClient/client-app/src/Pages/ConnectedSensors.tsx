import React from 'react';
import { Link } from 'react-router-dom';


export default function ConnectedSensors(){
    return (
    <p>
        This is the Connected Sensors
        <ul>
            <li>
                <Link to='/account'>
                    Go to Account
                </Link>
            </li>

            <li>
                <Link to='/'>
                    Go to Home
                </Link>
            </li>
            <li>
                <Link to='/library'>
                    Go to Bibliothèque
                </Link>
            </li>

            <li>
                <Link to='/myGardens'>
                    Go to Mes Jardins
                </Link>
            </li>
        </ul>
        
    </p>
    )
}