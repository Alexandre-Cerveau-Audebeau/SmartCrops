import * as React from 'react';
import Box from '@mui/material/Box';
import Modal from '@mui/material/Modal';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import axios from 'axios';
import PlantType from '../Models/PlantType';

const style = {
  position: 'absolute' as 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 400,
  bgcolor: 'background.paper',
  border: '2px solid #000',
  boxShadow: 24,
  p: 4,
};

export default function AddPlantModal() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState<string>('');
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);
  

  async function createPlant() {
    await axios.post<PlantType>('https://localhost:7137/api/plantTypes', {
      plantName: name
    });
    handleClose();
  }
 
  return (
    <div>
      <Button sx={{ml:0}} variant="contained" onClick={handleOpen}>
        Ajouter Plante
      </Button>
      <Modal
        keepMounted
        open={open}
        onClose={handleClose}
        aria-labelledby="keep-mounted-modal-title"
        aria-describedby="keep-mounted-modal-description"
      >
          <Box sx={style}>

                <Typography id="keep-mounted-modal-description" sx={{ mt: 2 }}>
                    Ajouter une plante
                </Typography>
                
                <TextField
                  required
                  id="outlined-required"
                  label="Plant Name Required"
                  value={name}
                  onChange={(event)=>setName(event.target.value)}

                  onKeyPress={(ev) => {
                    if (ev.key === "Enter") {
                      ev.preventDefault();
                      createPlant();
                    }
                  }}
                />
                
                <Button variant="contained" color="success"
                onClick={createPlant}>
                  Ajouter
                </Button>
         </Box>
      </Modal>
    </div>
  );
}