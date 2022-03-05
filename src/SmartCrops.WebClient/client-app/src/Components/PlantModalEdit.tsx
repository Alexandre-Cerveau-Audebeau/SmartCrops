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
  width: 400,
  bgcolor: 'background.paper',
  border: '2px solid #000',
  boxShadow: 24,
  p: 4,
};

interface IProps {
  plant: PlantType;
}


export default function EditPlantModal(props: IProps) {
  const [open, setOpen] = React.useState(false);
  const [plant, setPlant] = React.useState<PlantType | undefined>();
  const {mutate} = useSWRConfig();
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  React.useEffect(() => {
    setPlant(props.plant)
  },[props.plant]);

  
  
  async function editPlant() {
    await axios.put<PlantType>('https://localhost:7137/api/plantTypes', plant);
    mutate('/plantTypes')
    handleClose();
    console.log(
      "name : ",plant?.plantName, " Plant ID : ", plant?.id
    );
    

  }

  
  return (
    <div>
      <Button 
      onClick={handleOpen}
      >
        Edit
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
                    Editer la plante
                </Typography>
                <TextField
                  disabled
                  id="outlined-disabled"
                  label="Disabled"
                  value={plant?.id}
                />
                <TextField
                  required
                  id="outlined-required"
                  label="Plant Name Required"
                  value={plant?.plantName}
                  onChange={(event)=>{setPlant(Object.assign( {}, {...plant, plantName: event.target.value}) as PlantType);}}
                  onKeyPress={(ev) => {
                    if (ev.key === "Enter") {
                      ev.preventDefault();
                      editPlant();
                    }
                  }}
                />
                <Button
                onClick={editPlant}>
                  Modifier
                </Button>
         </Box>
      </Modal>
    </div>
  );
}