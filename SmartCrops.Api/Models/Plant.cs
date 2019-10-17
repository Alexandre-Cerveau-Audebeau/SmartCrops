using SmartCrops.Api.Models.Relations;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace SmartCrops.Api.Models
{
    public class Plant
    {
        public Guid Id { get; set; }

        public string Name { get; set; }

        public string Chorologie { get; set; }

        public List<UserPlant> Users { get; set; }
    }
}
