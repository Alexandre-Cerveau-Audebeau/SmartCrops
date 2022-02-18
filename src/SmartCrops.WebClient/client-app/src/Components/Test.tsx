import axios from "axios";
import React from "react";
import PlantType from "../Models/PlantType"



export default function Test()
{
    const [plants, setPlants] = React.useState<PlantType[]>([]);
    async function test() {
        let response = await axios.get<PlantType[]>('https://localhost:7137/api/plantTypes');
        setPlants(response.data);
    }

    return(<React.Fragment>
        <button onClick={test}>test</button>
        {plants.map(plant => {
            return (
                <ul>
                    {plant.plantName}
                </ul>
                    

                );
        })}
    </React.Fragment>);
}