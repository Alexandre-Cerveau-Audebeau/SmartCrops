import * as React from 'react';
import Box from '@mui/material/Box';
import Modal from '@mui/material/Modal';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import axios from 'axios';
import PlantType from '../Models/PlantType';
import { useSWRConfig } from 'swr';


const style = {
  position: 'absolute' as 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 600,
  bgcolor: 'background.paper',
  border: '2px solid #000',
  boxShadow: 24,
  p: 4,
};

interface IProps {
  plant: PlantType;
}


export default function DeletePlantModal(props: IProps) {
  const [open, setOpen] = React.useState(false);
  const [plant, setPlant] = React.useState<PlantType | undefined>();
  const {mutate} = useSWRConfig();
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  React.useEffect(() => {
    setPlant(props.plant)
  },[props.plant]);

  
  
  async function deletePlant() {
    await axios.delete<PlantType>('https://localhost:7137/api/plantTypes/');
    mutate('/plantTypes');
    handleClose();
    console.log(
      "name : ",plant?.plantName, " Plant ID : ", plant?.id
    );
    

  }

  
  return (
    <div>
      <Button variant="outlined" color="error" onClick={handleOpen}>
        Delete
      </Button>
      
      <Modal
        keepMounted
        open={open}
        onClose={handleClose}
        aria-labelledby="keep-mounted-modal-title"
        aria-describedby="keep-mounted-modal-description"
      >
          <Box sx={style}>

                <Typography id="keep-mounted-modal-description" sx={{ mt: 2, mb: 2}} align="left">
                    Voulez-vous supprimer La plante ?
                </Typography>
                <p>
                  <TextField 
                    disabled
                    id="filled-disabled"
                    label="Disabled"
                    variant="filled"
                    value={plant?.id}
                    sx={{ mr: 2 }}
                  />
                  <TextField
                    disabled
                    id="filled-disabled"
                    label="Disabled"
                    variant="filled"
                    value={plant?.plantName}
                  />
                </p>                
                  <Button
                  variant="outlined"
                  color="error"
                  onClick={deletePlant}>
                    Supprimer
                  </Button>
                  
         </Box>
      </Modal>
    </div>
  );
}