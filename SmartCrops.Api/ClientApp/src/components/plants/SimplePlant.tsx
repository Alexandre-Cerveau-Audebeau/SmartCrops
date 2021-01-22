import React from 'react';
import ListGroupItem from 'reactstrap/lib/ListGroupItem';
import { isPropertySignature } from 'typescript';


function SimplePlant(props: any) {
    return (
        <ListGroupItem>
          {props.name} 
          {props.age} <br />

        </ListGroupItem>
    );
}
export default SimplePlant;
