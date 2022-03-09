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


export default function EditGroundModal(props: IProps) {
  const [open, setOpen] = React.useState(false);
  const [ground, setGround] = React.useState<GroundType | undefined>();
  const {mutate} = useSWRConfig();
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  React.useEffect(() => {
    setGround(props.ground)
  },[props.ground]);

  
  
  async function editGround() {
    await axios.put<GroundType>('https://localhost:7137/api/groundTypes', ground);
    mutate('/groundTypes');
    handleClose();
  }

  
  return (
    <div>
      <Button variant="outlined"
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
                <Typography id="keep-mounted-modal-description" sx={{ mt: 2, mb: 2 }}>
                    Editer le Sol
                </Typography>
                <TextField
                  disabled
                  id="outlined-disabled"
                  label="Disabled"
                  sx={{ mb: 2, mr: 2 }}
                  value={ground?.id}
                />
                <TextField
                  required
                  id="outlined-required"
                  label="Ground Name Required"
                  value={ground?.groundName}
                  onChange={(event)=>{setGround(Object.assign( {}, {...ground, groundName: event.target.value}) as GroundType);}}
                  onKeyPress={(ev) => {
                    if (ev.key === "Enter") {
                      ev.preventDefault();
                      editGround();
                    }
                  }}
                />
                <Button variant="contained"
                onClick={editGround}>
                  Modifier
                </Button>
         </Box>
      </Modal>
    </div>
  );
}