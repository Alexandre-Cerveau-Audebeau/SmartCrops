using Microsoft.AspNetCore.Identity;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SmartCrops.Entities
{
    public class User : IdentityUser<int>
    {
        [Required]
        [MinLength(2)]
        [MaxLength(255)]
        public string FirstName { get; set; }

        [Required]
        [MinLength(2)]
        [MaxLength(255)]
        public string LastName { get; set; }

        [MinLength(2)]
        [MaxLength(255)]
        public string Contry { get; set; }

        [MinLength(2)]
        [MaxLength(255)]
        public string City { get; set; }

        public List<Garden> Gardens { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.Now;

    }
}
