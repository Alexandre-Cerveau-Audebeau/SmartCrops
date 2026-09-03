import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import GrassOutlinedIcon from '@mui/icons-material/GrassOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import HowToRegOutlinedIcon from '@mui/icons-material/HowToRegOutlined';
import LocalFloristOutlinedIcon from '@mui/icons-material/LocalFloristOutlined';
import type { AdminDashboardStats } from '../../types/Admin';
import { formatRelativeDate } from '../../utils/formatRelativeDate';

interface TileProps {
  icon: ReactNode;
  label: string;
  value: string | null;
  sub: ReactNode;
  /** The « Utilisateurs » tile: tinted background and border. */
  hero?: boolean;
  loading: boolean;
}

function Tile({ icon, label, value, sub, hero = false, loading }: TileProps) {
  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 3,
        height: '100%',
        ...(hero ? { bgcolor: 'brandTintBg', borderColor: 'borderSubtle' } : {}),
      }}
    >
      <CardContent sx={{ p: { xs: 1.75, md: 2.25 }, '&:last-child': { pb: { xs: 1.75, md: 2.25 } } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box
            aria-hidden
            sx={{
              width: 28,
              height: 28,
              flexShrink: 0,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: hero ? 'background.paper' : 'brandTintBg',
              color: 'primary.main',
              '& svg': { fontSize: 16 },
            }}
          >
            {icon}
          </Box>
          <Typography
            component="span"
            sx={{
              fontSize: 11.5,
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'text.secondary',
              lineHeight: 1.2,
            }}
          >
            {label}
          </Typography>
        </Box>
        {loading ? (
          <Skeleton variant="rounded" width={64} height={26} sx={{ mt: 1.5 }} />
        ) : (
          <Typography
            component="p"
            sx={{ fontSize: { xs: 22, md: 28 }, fontWeight: 800, lineHeight: 1.1 }}
          >
            {value}
          </Typography>
        )}
        {loading ? (
          <Skeleton variant="rounded" width={150} height={10} sx={{ mt: 1 }} />
        ) : (
          <Typography
            component="p"
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.5, fontSize: { xs: 11.5, md: 12.5 } }}
          >
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

interface AdminStatsTilesProps {
  stats: AdminDashboardStats | null;
  loading: boolean;
  mobile: boolean;
  /** Reference instant for « le plus récent créé hier ». */
  now: Date;
  language: string;
}

/**
 * SMA-414 — the four counters: Utilisateurs (hero, +7 j / +30 j), Jardins
 * créés (most recent, relative), Placements posés (across N gardens), Comptes
 * avec ≥ 1 jardin (share of users). 2×2 on mobile, one row on desktop.
 */
export default function AdminStatsTiles({
  stats,
  loading,
  mobile,
  now,
  language,
}: AdminStatsTilesProps) {
  const { t } = useTranslation();
  const fmt = (n: number) => n.toLocaleString(language);
  const percent =
    stats && stats.totalUsers > 0
      ? Math.round((stats.usersWithAtLeastOneGarden / stats.totalUsers) * 100)
      : 0;
  const strong = (
    <Box component="strong" sx={{ color: 'primary.main', fontWeight: 700 }} />
  );

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'repeat(2, minmax(0, 1fr))',
          md: 'repeat(4, minmax(0, 1fr))',
        },
        gap: { xs: 1.25, md: 1.75 },
        mb: { xs: 2, md: 2.5 },
      }}
    >
      <Tile
        hero
        loading={loading}
        icon={<GroupOutlinedIcon />}
        label={t('admin.tiles.users')}
        value={stats ? fmt(stats.totalUsers) : null}
        sub={
          stats && (
            <Trans
              i18nKey={mobile ? 'admin.tiles.usersSubMobile' : 'admin.tiles.usersSub'}
              values={{
                last7: fmt(stats.newUsersLast7Days),
                last30: fmt(stats.newUsersLast30Days),
              }}
              components={{ strong }}
            />
          )
        }
      />
      <Tile
        loading={loading}
        icon={<GrassOutlinedIcon />}
        label={t(mobile ? 'admin.tiles.gardensMobile' : 'admin.tiles.gardens')}
        value={stats ? fmt(stats.gardensCount) : null}
        sub={
          stats &&
          (stats.latestGardenCreatedAt
            ? t(mobile ? 'admin.tiles.gardensSubMobile' : 'admin.tiles.gardensSub', {
                relative: formatRelativeDate(
                  new Date(stats.latestGardenCreatedAt),
                  now,
                  language,
                  mobile ? 'short' : 'long'
                ),
              })
            : t('admin.tiles.gardensSubEmpty'))
        }
      />
      <Tile
        loading={loading}
        icon={<LocalFloristOutlinedIcon />}
        label={t(mobile ? 'admin.tiles.placementsMobile' : 'admin.tiles.placements')}
        value={stats ? fmt(stats.placementsCount) : null}
        sub={
          stats &&
          t(mobile ? 'admin.tiles.placementsSubMobile' : 'admin.tiles.placementsSub', {
            count: stats.gardensCount,
          })
        }
      />
      <Tile
        loading={loading}
        icon={<HowToRegOutlinedIcon />}
        label={t(mobile ? 'admin.tiles.withGardenMobile' : 'admin.tiles.withGarden')}
        value={stats ? fmt(stats.usersWithAtLeastOneGarden) : null}
        sub={
          stats &&
          t(mobile ? 'admin.tiles.withGardenSubMobile' : 'admin.tiles.withGardenSub', {
            percent,
          })
        }
      />
    </Box>
  );
}
