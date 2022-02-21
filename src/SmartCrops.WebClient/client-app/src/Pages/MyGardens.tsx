import React from 'react';
import { Link } from 'react-router-dom';


export default function MyGardens(){
    return (
    <p>
        This is My Gardens

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
                <Link to='/connectedSensors'>
                    Go to Objets Connectés
                </Link>
            </li>
            
            <li>
                <Link to='/account'>
                    Go to Account
                </Link>
            </li>
        </ul>
    </p>
    )
}