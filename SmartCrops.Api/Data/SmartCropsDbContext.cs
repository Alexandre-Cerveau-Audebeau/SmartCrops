using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace SmartCrops.Api.Data
{
    public class SmartCropsDbContext : DbContext
    {

        public SmartCropsDbContext(DbContextOptions options) : base(options)
        {

        }
    }
}
