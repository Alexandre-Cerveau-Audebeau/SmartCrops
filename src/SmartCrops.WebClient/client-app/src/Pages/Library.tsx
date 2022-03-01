import React from 'react';
import { Button } from '@mui/material';
import MuiLink from '@mui/material/Link';


export default function Library(){
    return (
    <p>
        <div className="App">
            <Button >
                <MuiLink href='/plantsLibrary' color="inherit" underline="none">
                    Plantes
                </MuiLink>
                
            </Button>
        </div>

        <div className="App">
            <Button >
                <MuiLink href='/groundsLibrary' color="inherit" underline="none">
                    Sols
                </MuiLink>
            </Button>
        </div>

        
    </p>
    
    )
}