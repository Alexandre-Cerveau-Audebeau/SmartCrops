using Microsoft.EntityFrameworkCore;
using SmartCrops.Api.Models;
using SmartCrops.Api.Models.Relations;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace SmartCrops.Api.Data
{
    public class SmartCropsDbContext : DbContext
    {
        public DbSet<User> Users { get; set; }

        public DbSet<Plant> Plants { get; set; }

        public DbSet<UserPlant> UserPlants { get; set; }

        public SmartCropsDbContext(DbContextOptions options) : base(options)
        {

        }
    }
}
