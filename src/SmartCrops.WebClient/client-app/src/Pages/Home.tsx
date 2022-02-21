import React from 'react';
import { Link } from 'react-router-dom';



export default function Home(){
    return (
    <p>
        This is Home
        <ul>  
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
                    Go to Objet Connectés
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