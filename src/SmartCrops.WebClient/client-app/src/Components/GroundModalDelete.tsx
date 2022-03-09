import * as React from 'react';
import Box from '@mui/material/Box';
import Modal from '@mui/material/Modal';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import axios from 'axios';
import GroundType from '../Models/GroundType';
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
  ground: GroundType;
}


export default function DeleteGroundModal(props: IProps) {
  const [open, setOpen] = React.useState(false);
  const [ground, setGround] = React.useState<GroundType | undefined>();
  const {mutate} = useSWRConfig();
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  React.useEffect(() => {
    setGround(props.ground)
  },[props.ground]);

  
  
  async function deleteGround() {
    await axios.delete<GroundType>('https://localhost:7137/api/groundTypes?id='+ground?.id);
    mutate('/groundTypes');
    handleClose(); 
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
          <Box sx={style}
          onKeyPress={(ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              deleteGround();
            }
          }}>

                <Typography id="keep-mounted-modal-description" sx={{ mt: 2, mb: 2}} align="left">
                    Voulez-vous supprimer Le Sol ?
                </Typography>
                <p>
                  <TextField 
                    disabled
                    id="filled-disabled"
                    label="Disabled"
                    variant="filled"
                    value={ground?.id}
                    sx={{ mr: 2 }}
                  />
                  <TextField
                    disabled
                    id="filled-disabled"
                    label="Disabled"
                    variant="filled"
                    value={ground?.groundName}
                  />
                </p>                
                  <Button
                  variant="outlined"
                  color="error"
                  onClick={deleteGround}>
                    Supprimer
                  </Button>
                  
         </Box>
      </Modal>
    </div>
  );
}