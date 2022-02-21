import React from "react";
import {Navbar,Nav, NavItem} from 'react-bootstrap';
import {Link} from 'react-router-dom';

export default function Navigation(){
    return(
        <Navbar bg="dark" expand ="lg">
            <Navbar.Toggle aria-controls="basic-navbar-nav"/>
            <Navbar.Collapse id="basic-navbar-nav">
                <Nav>
                    <NavItem>
                        <Nav.Link className="d-inline p-2 bg-dark text-white"  as={Link} to='/'>
                            Accueil
                        </Nav.Link>
                    </NavItem>

                    <NavItem>
                        <Nav.Link className="d-inline p-2 bg-dark text-white" as={Link} to='/library'>
                            Bibliothèque
                        </Nav.Link>
                    </NavItem>

                    <NavItem>
                        <Nav.Link className="d-inline p-2 bg-dark text-white" as={Link} to='/myGardens'>
                            Mon Jardin
                        </Nav.Link>
                    </NavItem>
                    
                    <NavItem>
                        <Nav.Link className="d-inline p-2 bg-dark text-white" as={Link} to='/connectedSensors'>
                            Objects Connectés
                        </Nav.Link>
                    </NavItem>
                    
                    <Nav className="ml-auto">
                        <NavItem>
                            <Nav.Link className="d-inline p-2 bg-dark text-white" as={Link} to='/account'>
                                Login
                            </Nav.Link>
                        </NavItem>                        
                    </Nav>
                    
                </Nav>
            </Navbar.Collapse>
        </Navbar>
    )


}