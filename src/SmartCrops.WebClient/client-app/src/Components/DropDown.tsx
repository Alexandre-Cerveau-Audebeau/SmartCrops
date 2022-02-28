import React from 'react';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import MuiLink from '@mui/material/Link';

interface IProps {
    name: string;
    link: string;
}

const pages: IProps[] = [
    { name: 'Plantes', link: '/plantsLibrary'},
    { name: 'Sols', link: '/groundsLibrary'},
];

export default function Dropdown(props: IProps) {

  const [anchorEl, setAnchorEl] = React.useState<any>(null);
  const [isInButton, setIsInButton] = React.useState<boolean>(false);
  const [isInMenu, setIsInMenu] = React.useState<boolean>(false);

  React.useEffect(() => {
    if(!isInMenu && !isInButton) {
        setAnchorEl(null);
    }
  }, [isInButton, isInMenu]);

  function handle(event: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
        if (anchorEl !== event.currentTarget) {
            setIsInButton(true);
            setAnchorEl(event.currentTarget);
            }
  }

  //function handleClose() {
  //  setAnchorEl(null);
  //}

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <div>
        <Button
            aria-owns={anchorEl ? "Dropdown" : undefined}
            aria-haspopup="true"
            sx={{ my: 2, color: 'white'}}
            endIcon={<ArrowDropDownIcon/>}
            onClick={handleClose}
            onMouseOver={(event) => handle(event)}
            onMouseLeave={() => { setIsInButton(false); console.log("onMouseLeave Button")}}
        >
            <MuiLink href='/library' color="inherit" underline="none">
                {props.name}
            </MuiLink>
        </Button>

        <Menu
            id="Dropdown"
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleClose}
            MenuListProps={{ onMouseLeave: handleClose }}
            onMouseOver={() => setIsInMenu(true)}
            onMouseLeave={() => setIsInMenu(false)}
        >
            {pages.map((page: IProps) => (
                <MenuItem key={page.name} onClick={handleClose}>
                    <MuiLink textAlign="center" href={page.link} color="inherit" underline="none">
                        {page.name}
                    </MuiLink>
                </MenuItem>
            ))}
        </Menu>
    </div>
  );
}