import React from 'react';
import { Link } from 'react-router-dom';
import Test from '../Components/Test';



export default function Library(){
    return (
    <p>
        This is My Library
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
                <Link to='/connectedSensors'>
                    Go to Objet Connectés
                </Link>
            </li>

            <li>
                <Link to='/myGardens'>
                    Go to Mes Jardins
                </Link>
            </li>

            <li>
                <div className="App">
                    <Test />
                </div>
            </li>
        </ul>

        
    </p>
    
    )
}