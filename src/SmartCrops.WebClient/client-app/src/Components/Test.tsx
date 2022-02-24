import axios from "axios";
import React from "react";
import Button from 'react-bootstrap/Button';
import PlantType from "../Models/PlantType";
import GroundType from "../Models/GroundType";



export default function DisplayPlant()
{
    const [plants, setPlants] = React.useState<PlantType[]>([]);
    async function displayPlant() {
        let response = await axios.get<PlantType[]>('https://localhost:7137/api/plantTypes');
        setPlants(response.data);
    }

    return(<React.Fragment>
        <Button onClick={displayPlant}>Afficher Plantes</Button>
        {plants.map(plant => {
            return (
                <ul>
                    {plant.plantName}
                </ul>
                );
        })}
    </React.Fragment>);
}
