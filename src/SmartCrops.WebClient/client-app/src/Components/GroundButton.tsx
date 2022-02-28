import axios from "axios";
import React from "react";
import Button from 'react-bootstrap/Button';
import GroundType from "../Models/GroundType";



export default function DisplayGrounds()
{
    const [grounds, setGrounds] = React.useState<GroundType[]>([]);
    async function displayGround() {
        let response = await axios.get<GroundType[]>('https://localhost:7137/api/groundTypes');
        setGrounds(response.data);
    }

    return(
        <React.Fragment>
            <Button onClick={displayGround}>Afficher Sols</Button>
            {grounds.map(ground => {
                return (
                    <ul>
                        {ground.groundName}
                    </ul>
                    );
            })}
        </React.Fragment>);
}
