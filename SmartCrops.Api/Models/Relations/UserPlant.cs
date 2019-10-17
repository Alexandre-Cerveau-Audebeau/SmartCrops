using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace SmartCrops.Api.Models.Relations
{
    public class UserPlant
    {
        public Guid Id { get; set; }

        public Guid UserId { get; set; }

        public User User { get; set; }

        public Guid PlantId { get; set; }

        public Plant Plant { get; set; }

        public DateTime CreateAt { get; set; }
    }
}
