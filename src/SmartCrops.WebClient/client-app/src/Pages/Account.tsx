import React from 'react';
import { Link } from 'react-router-dom';

export default function Account(){
    return (
    <p>
        This is Account
        <ul>
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

            <li>
                <Link to='/connectedSensors'>
                    Go to Objets Connectés
                </Link>
            </li>
        </ul>    
            
    </p>
    )
}