using Microsoft.AspNetCore.Identity;
using SmartCrops.Api.Models.Relations;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace SmartCrops.Api.Models
{
    public class User : IdentityUser<Guid>
    {
        public List<UserPlant> Plants { get; set; }
    }
}
