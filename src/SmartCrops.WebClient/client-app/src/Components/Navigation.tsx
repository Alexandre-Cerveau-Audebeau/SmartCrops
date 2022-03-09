import * as React from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Menu from '@mui/material/Menu';
import MenuIcon from '@mui/icons-material/Menu';
import Container from '@mui/material/Container';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import MuiLink from '@mui/material/Link';
import Dropdown from './DropDown';

interface IPage {
    name: string;
    link: string;
    isDropDown?: boolean;
};

const pages: IPage[] = [
    { name: 'Bibliothèque', link: '/library', isDropDown: true},
    { name: 'Mon Jardin', link: '/myGardens'},
    { name: 'Objet Connectés', link: '/connectedSensors'},
];
const settings: IPage[] = [
    { name: 'Profile', link: '/account'},
    { name: 'Account', link: '/account'},
    { name: 'Dashboard', link: '/account'},
    { name: 'Logout', link: '/account'},
];

export default function ResponsiveAppBar() {
  const [anchorElNav, setAnchorElNav] = React.useState<null | HTMLElement>(null);
  const [anchorElUser, setAnchorElUser] = React.useState<null | HTMLElement>(null);
  const [isDropDown, setIsDropDown] = React.useState<boolean>(false);  

  const handleOpenNavMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorElNav(event.currentTarget);
  };
  const handleOpenUserMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorElUser(event.currentTarget);
  };

  const handleCloseNavMenu = () => {
    setAnchorElNav(null);
  };

  const handleCloseUserMenu = () => {
    setAnchorElUser(null);
  };



return (
    <React.Fragment>
        <AppBar position="static">
            <Container maxWidth="xl">
                <Toolbar disableGutters>
                    <Button
                        onClick={handleCloseNavMenu}
                        sx={{ my: 2, color: 'white', display: 'block' }}
                        >
                        <MuiLink href='/'color="inherit" underline="none">
                            SmartCrops
                        </MuiLink>
                    </Button>
                    

                    <Box sx={{ flexGrow: 1, display: { xs: 'flex', md: 'none' } }}>
                        <IconButton
                            size="large"
                            aria-label="account of current user"
                            aria-controls="menu-appbar"
                            aria-haspopup="true"
                            onClick={handleOpenNavMenu}
                            color="inherit"
                        >
                            <MenuIcon />
                        </IconButton>
                        <Menu
                            id="menu-appbar"
                            anchorEl={anchorElNav}
                            anchorOrigin={{
                                vertical: 'bottom',
                                horizontal: 'left',
                            }}
                            keepMounted
                            transformOrigin={{
                                vertical: 'top',
                                horizontal: 'left',
                            }}
                            open={Boolean(anchorElNav)}
                            onClose={handleCloseNavMenu}
                            sx={{
                                display: { xs: 'block', md: 'none' },
                            }}
                        >

                            {pages.map((page: IPage) => (
                                <MenuItem key={page.name} onClick={handleCloseNavMenu}>
                                    <Typography textAlign="center">
                                        {page.name}
                                    </Typography>
                                </MenuItem>
                            ))}
                        </Menu>
                    </Box>
                
                    <Typography
                        variant="h6"
                        noWrap
                        component="div"
                        sx={{ flexGrow: 1, display: { xs: 'flex', md: 'none' } }}
                    >
                        <MuiLink href='/'color="inherit" underline="none">
                            SmartCrops
                        </MuiLink>

                    </Typography>

                    <Box sx={{ flexGrow: 1, display: { xs: 'none', md: 'flex' } }}>
                        {pages.map((page: IPage) => {
                            if(page.isDropDown) {
                            return (
                                <Dropdown name={page.name} link={page.link} />
                            )} else {
                                return (
                                    <Button
                                        key={page.name}
                                        onClick={handleCloseNavMenu}
                                        sx={{ my: 2, color: 'white', display: 'block' }}
                                    >
                                        <MuiLink href={page.link}color="inherit" underline="none">
                                            {page.name}
                                        </MuiLink>

                                    </Button>
                                )
                            }
                        })}
                    </Box>

                    <Box sx={{ flexGrow: 0 }}>
                        <Tooltip title="Open settings">
                            <IconButton onClick={handleOpenUserMenu} sx={{ p: 0 }}>
                                <Avatar alt="Remy Sharp" src="/static/images/avatar/2.jpg" />
                            </IconButton>
                        </Tooltip>
                        <Menu
                            sx={{ mt: '45px' }}
                            id="menu-appbar"
                            anchorEl={anchorElUser}
                            anchorOrigin={{
                                vertical: 'top',
                                horizontal: 'right',
                            }}
                            keepMounted
                            transformOrigin={{
                                vertical: 'top',
                                horizontal: 'right',
                            }}
                            open={Boolean(anchorElUser)}
                            onClose={handleCloseUserMenu}
                        >
                            {settings.map((setting:IPage) => (
                                <MenuItem key={setting.name} onClick={handleCloseUserMenu}>
                                    <MuiLink textAlign="center" href={setting.link} color="inherit" underline="none">
                                        {setting.name}
                                    </MuiLink>
                                </MenuItem>
                            ))}
                        </Menu>
                    </Box>
                </Toolbar>
            </Container>
        </AppBar>
    </React.Fragment>
);

};
