using Microsoft.EntityFrameworkCore;
using SmartCrops.Entities;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace SmartCrops.Api.Data
{
    public class SmartCropsDbContext : DbContext
    {
        public DbSet<User> Users { get; set; }
        public DbSet<Garden> Gardens { get; set; }
        public DbSet<Plant> Plants { get; set; }
        public DbSet<PlantType> PlantTypes { get; set; }
        public DbSet<Ground> Grounds { get; set; }
        public DbSet<GroundType> GroundTypes { get; set; }
        public DbSet<Obstacle> Obstacles { get; set; }

        public SmartCropsDbContext(DbContextOptions options) : base(options)
        {

        }
    }
}
