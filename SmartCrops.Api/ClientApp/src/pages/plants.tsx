import React from 'react';
import SimplePlant from '../components/plants/SimplePlant';
import { ListGroup, Button } from 'reactstrap';

const plants = [
    { name: 'pedro', age: 28 },
    { name: 'odbeau', age: 24},
]

function Plants() {
    return (
        <div>
            <h1>J'ai réussi</h1>

            <ListGroup>
                {plants.map(plant => {
                    return <SimplePlant name={plant.name} age={plant.age} />;
                })}
            </ListGroup>

            <div>
                <Button outline color="primary">My Gardens</Button>{' '}
                <Button color="success">success</Button>{' '}
            </div>

        </div>
    );
}

export default Plants;