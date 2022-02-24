import React from 'react';
import { Link } from 'react-router-dom';
import DisplayPlant from '../Components/Test';
import Test from '../Components/Test';



export default function Library(){
    return (
    <p>
        This is My Library
        <div className="App">
            <DisplayPlant />
            
        </div>

        
    </p>
    
    )
}